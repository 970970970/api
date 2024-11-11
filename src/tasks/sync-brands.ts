import { initDbConnect } from "../db";
import { brands } from "../db/schema";
import { eq, sql } from "drizzle-orm";

interface BrandData {
  id: string;
  name: string;
  status: string;
  description: string;
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

interface DataResponse {
  brands: {
    [key: string]: BrandData;
  };
}

export async function syncBrands(env: any) {
  try {
    // 获取远程数据
    const response = await fetch('https://raw.githubusercontent.com/TechForPalestine/boycott-israeli-consumer-goods-dataset/refs/heads/main/output/json/data.json');
    const data: DataResponse = await response.json();
    
    const db = initDbConnect(env.DB);
    
    // 获取所有现有品牌
    const existingBrands = await db.select().from(brands).execute();
    const existingBrandNames = new Set(existingBrands.map(b => b.name));
    
    // 处理每个品牌
    for (const brandData of Object.values(data.brands)) {
      const brandRecord = {
        name: brandData.name,
        description: brandData.description,
        status: brandData.status,
        entity_type: 'brand', // 默认为品牌类型
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

      if (existingBrandNames.has(brandData.name)) {
        // 更新现有记录
        await db.update(brands)
          .set(brandRecord)
          .where(eq(brands.name, brandData.name))
          .execute();
      } else {
        // 插入新记录
        await db.insert(brands)
          .values({
            ...brandRecord,
            created_at: sql`CURRENT_TIMESTAMP`
          })
          .execute();
      }
    }

    return { success: true, message: 'Brands sync completed' };
  } catch (error: unknown) {
    console.error('Error syncing brands:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
} 