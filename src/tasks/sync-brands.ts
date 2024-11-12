import { initDbConnect } from "../db";
import { brands, media_files } from "../db/schema";
import { eq, sql } from "drizzle-orm";

// 定义数据类型
interface BrandData {
  name: string;
  description: string;
  status: string;
  reasons?: string[];
  countries?: string[];
  categories?: string[];
  website?: string;
  logo_url?: string;
  alternatives?: string[];
  alternatives_text?: string;
  stakeholders?: Array<{
    id: string;
    type: string;
  }>;
}

interface GitHubData {
  brands: {
    [key: string]: BrandData;
  };
}

async function fetchWithTimeout(url: string, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site'
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function isValidImage(url: string): Promise<boolean> {
  try {
    console.log(`Checking image validity: ${url}`);
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.log(`Invalid image response: ${response.status}`);
      return false;
    }
    const contentType = response.headers.get('content-type');
    const isValid = contentType?.startsWith('image/') || false;
    console.log(`Image validity check result: ${isValid}`);
    return isValid;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(`Image validity check failed: ${errorMessage}`);
    return false;
  }
}

async function downloadAndSaveImage(url: string, brandName: string, env: any): Promise<number | null> {
  try {
    const db = initDbConnect(env.DB);
    
    // 先检查 media_files 表中是否已经有相同描述的图片
    const existingMedia = await db
      .select()
      .from(media_files)
      .where(eq(media_files.description, `Logo for brand: ${brandName}`))
      .get();

    if (existingMedia?.id) {
      console.log(`Found existing media ID ${existingMedia.id} for brand: ${brandName}`);
      return existingMedia.id;
    }

    console.log(`Downloading image for ${brandName}: ${url}`);
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.log(`Download failed with status: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      console.log(`Invalid content type: ${contentType}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${contentType.split('/')[1]}`;
    const filePath = `uploads/${fileName}`;

    console.log(`Saving image to R2: ${filePath}`);
    await env.BUCKET.put(filePath, buffer, {
      httpMetadata: {
        contentType: contentType,
      }
    });

    const result = await db
      .insert(media_files)
      .values({
        path: filePath,
        content_type: contentType,
        size: buffer.byteLength,
        description: `Logo for brand: ${brandName}`,
      })
      .returning()
      .get();

    console.log(`Image saved to media_files with id: ${result.id}`);
    return result.id;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error downloading and saving image:', errorMessage);
    return null;
  }
}

export async function syncBrands(env: any) {
  try {
    console.log('Starting brands sync...');
    const response = await fetch('https://raw.githubusercontent.com/TechForPalestine/boycott-israeli-consumer-goods-dataset/refs/heads/main/output/json/data.json');
    const data: GitHubData = await response.json();

    const db = initDbConnect(env.DB);
    const existingBrands = await db.select().from(brands).execute();
    const existingBrandNames = new Set(existingBrands.map(b => b.name));

    console.log(`Found ${Object.keys(data.brands).length} brands to process`);
    let processed = 0;

    for (const [brandId, brandData] of Object.entries(data.brands)) {
      processed++;
      console.log(`Processing brand ${processed}/${Object.keys(data.brands).length}: ${brandData.name}`);

      const brandRecord: any = {
        name: brandData.name,
        description: brandData.description,
        status: brandData.status,
        entity_type: 'brand',
        reasons: JSON.stringify(brandData.reasons || []),
        countries: JSON.stringify(brandData.countries || []),
        categories: JSON.stringify(brandData.categories || []),
        website: brandData.website || '',
        logo_url: brandData.logo_url || '',
        alternatives: JSON.stringify(brandData.alternatives || []),
        alternatives_text: brandData.alternatives_text || '',
        stakeholders: JSON.stringify(brandData.stakeholders || []),
        updated_at: sql`CURRENT_TIMESTAMP`
      };

      // 查找现有品牌记录
      const existingBrand = existingBrands.find(b => b.name === brandData.name);

      // 只有当品牌没有 logo_media_id 或 logo_url 发生变化时才理 logo
      if (brandData.logo_url &&
        (!existingBrand?.logo_media_id ||
          existingBrand.logo_url !== brandData.logo_url)) {
        console.log(`Checking logo for ${brandData.name}`);
        if (await isValidImage(brandData.logo_url)) {
          const mediaId = await downloadAndSaveImage(brandData.logo_url, brandData.name, env);
          if (mediaId) {
            brandRecord.logo_media_id = mediaId;
            console.log(`Updated logo_media_id for ${brandData.name}: ${mediaId}`);
          }
        } else {
          console.log(`Invalid or inaccessible logo for ${brandData.name}`);
        }
      } else {
        console.log(`Skipping logo processing for ${brandData.name}`);
        if (existingBrand?.logo_media_id) {
          brandRecord.logo_media_id = existingBrand.logo_media_id;
        }
      }

      if (existingBrandNames.has(brandData.name)) {
        console.log(`Updating existing brand: ${brandData.name}`);
        await db.update(brands)
          .set(brandRecord)
          .where(eq(brands.name, brandData.name))
          .execute();
      } else {
        console.log(`Creating new brand: ${brandData.name}`);
        await db.insert(brands)
          .values({
            ...brandRecord,
            created_at: sql`CURRENT_TIMESTAMP`
          })
          .execute();
      }
    }

    console.log('Brands sync completed successfully');
    return { success: true, message: 'Brands sync completed' };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error syncing brands:', error);
    return { success: false, message: errorMessage };
  }
} 