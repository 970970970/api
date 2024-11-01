import { Hono } from 'hono';
import { initDbConnect } from "../db/index";
import { admin_users } from "../db/schema";
import { count, eq } from "drizzle-orm";
import { hashSync, compareSync } from "bcrypt-edge";
import { jwt, sign } from 'hono/jwt';

// TOTP 实现
class TOTP {
  private static readonly DIGITS = '0123456789';
  private static readonly PERIOD = 30; // 30 seconds
  private static readonly CODE_LENGTH = 6;
  private static readonly BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  // Base32 解码函数
  private static base32Decode(str: string): Uint8Array {
    let bits = 0;
    let value = 0;
    let index = 0;
    const result = new Uint8Array(Math.ceil(str.length * 5 / 8));

    str = str.toUpperCase();
    for (let i = 0; i < str.length; i++) {
      const v = this.BASE32_CHARS.indexOf(str[i]);
      if (v < 0) continue;
      
      value = (value << 5) | v;
      bits += 5;

      if (bits >= 8) {
        result[index++] = (value >>> (bits - 8)) & 255;
        bits -= 8;
      }
    }

    return result.slice(0, index);
  }

  static async generateSecret(): Promise<string> {
    const array = new Uint8Array(20);
    crypto.getRandomValues(array);
    
    // 生成 Base32 编码的密钥
    let secret = '';
    for (let i = 0; i < array.length; i += 5) {
      let buffer = 0;
      let bufferSize = 0;
      
      for (let j = 0; j < 5 && i + j < array.length; j++) {
        buffer = (buffer << 8) | array[i + j];
        bufferSize += 8;
        
        while (bufferSize >= 5) {
          secret += this.BASE32_CHARS[(buffer >>> (bufferSize - 5)) & 31];
          bufferSize -= 5;
          buffer &= (1 << bufferSize) - 1;
        }
      }
      
      if (bufferSize > 0) {
        secret += this.BASE32_CHARS[(buffer << (5 - bufferSize)) & 31];
      }
    }
    
    return secret;
  }

  static async generateTOTP(secret: string, counter: number): Promise<string> {
    // 将 Base32 编码的密钥解码为字节数组
    const secretBytes = this.base32Decode(secret);
    
    // 将计数器转换为 8 字节的 buffer
    const counterBytes = new Uint8Array(8);
    for (let i = counterBytes.length - 1; i >= 0; i--) {
      counterBytes[i] = counter & 0xff;
      counter = counter >> 8;
    }

    // 使用 HMAC-SHA1 计算哈希
    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, counterBytes);
    const hash = new Uint8Array(signature);

    // 获取偏移量
    const offset = hash[hash.length - 1] & 0xf;
    
    // 生成 4 字节的代码
    const code = ((hash[offset] & 0x7f) << 24) |
                ((hash[offset + 1] & 0xff) << 16) |
                ((hash[offset + 2] & 0xff) << 8) |
                (hash[offset + 3] & 0xff);

    // 转换为 6 位数字
    const otp = (code % 1000000).toString().padStart(6, '0');
    return otp;
  }

  static getCurrentCounter(): number {
    return Math.floor(Date.now() / 1000 / this.PERIOD);
  }

  static async verify(token: string, secret: string): Promise<boolean> {
    const counter = this.getCurrentCounter();
    // 检查当前和前一个时间窗口的代码
    const currentCode = await this.generateTOTP(secret, counter);
    const previousCode = await this.generateTOTP(secret, counter - 1);
    return token === currentCode || token === previousCode;
  }
}

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
  saltRounds: number;
};

export const administrator = new Hono<{ Bindings: Env }>()
const secure = new Hono<{ Bindings: Env }>()

secure.use('*', async (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
  })
  try {
    await jwtMiddleware(c, next)
  } catch (e) {
    return c.json({
      status: 401, msg: 'unauthorized',
    })
  }
});

secure.get("", async (c) => {
  const db = initDbConnect(c.env.DB);
  const offset = Number(c.req.query('offset')) || 0;
  const limit = Number(c.req.query('limit')) || 10;
  const admins = await db.select().from(admin_users).offset(offset).limit(limit);
  const total = await db.select({ value: count() }).from(admin_users);
  return c.json({
    status: 0, msg: 'ok', data: {
      items: admins,
      total: total[0].value,
    }
  });
})

secure.post("/create", async (c) => {
  const db = initDbConnect(c.env.DB);
  const body = await c.req.json();
  const hash = hashSync(body.password, c.env.saltRounds);
  const admin = await db
    .insert(admin_users)
    .values({ email: body.email, password: hash, status: body.status })
    .execute();
  return c.json({
    status: 0, msg: 'ok', data: admin
  })
})

secure.delete("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const action = await db
    .delete(admin_users)
    .where(eq(admin_users.id, id))
    .execute();
  return c.json({
    status: 0, msg: 'ok', data: null
  })
})

secure.put("/password/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const hash = hashSync(body.password, c.env.saltRounds);
  const action = await db
    .update(admin_users)
    .set({ password: hash })
    .where(eq(admin_users.id, id))
    .execute();
  return c.json({
    status: 0, msg: 'ok', data: null
  })
})

secure.put("/status/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const action = await db
    .update(admin_users)
    .set({ status: body.status })
    .where(eq(admin_users.id, id))
    .execute();
  const admin = await db.select().from(admin_users).where(eq(admin_users.id, id)).get();
  return c.json({
    status: 0, msg: 'ok', data: null
  })
})

secure.get("me", async (c) => {
  const db = initDbConnect(c.env.DB);
  const payload = c.get('jwtPayload');
  
  // 获取完整的用户信息
  const user = await db
    .select({
      id: admin_users.id,
      email: admin_users.email,
      two_factor_enabled: admin_users.two_factor_enabled
    })
    .from(admin_users)
    .where(eq(admin_users.id, payload.id))
    .get();

  return c.json({
    status: 0, 
    msg: 'ok', 
    data: user
  });
})

// 生成两步验证密钥和二维码
secure.post("/enable-2fa", async (c) => {
  const userId = c.get('jwtPayload').id;
  const email = c.get('jwtPayload').email;

  try {
    // 只生成密钥和二维码,不保存到数据库
    const secret = await TOTP.generateSecret();
    
    // 生成 TOTP URI
    const otpauth = `otpauth://totp/SayNo:${email}?secret=${secret}&issuer=SayNo&algorithm=SHA1&digits=6&period=30`;
    
    // 生成二维码 URL
    const qrcodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;

    return c.json({
      status: 0,
      msg: "ok",
      data: {
        secret,
        qrcode: qrcodeUrl
      }
    });
  } catch (error) {
    console.error("Error generating 2FA secret:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 验证并启用两步验证
secure.post("/verify-2fa", async (c) => {
  const db = initDbConnect(c.env.DB);
  const userId = c.get('jwtPayload').id;
  const body = await c.req.json();
  const { code, secret } = body;

  try {
    // 验证码是否正确
    const isValid = await TOTP.verify(code, secret);

    if (!isValid) {
      return c.json({
        status: 400,
        msg: "Invalid verification code",
        data: null
      });
    }

    // 验证通过后,更新用户的两步验证信息
    await db
      .update(admin_users)
      .set({ 
        two_factor_enabled: true,
        two_factor_secret: secret 
      })
      .where(eq(admin_users.id, userId))
      .execute();

    return c.json({
      status: 0,
      msg: "Two-factor authentication enabled",
      data: null
    });
  } catch (error) {
    console.error("Error verifying 2FA:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 禁用两步验证
secure.post("/disable-2fa", async (c) => {
  const db = initDbConnect(c.env.DB);
  const userId = c.get('jwtPayload').id;

  try {
    await db
      .update(admin_users)
      .set({ 
        two_factor_enabled: false,
        two_factor_secret: null 
      })
      .where(eq(admin_users.id, userId))
      .execute();

    return c.json({
      status: 0,
      msg: "Two-factor authentication disabled",
      data: null
    });
  } catch (error) {
    console.error("Error disabling 2FA:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 检查用户是否启用了两步验证
administrator.post("/check-2fa", async (c) => {
  const db = initDbConnect(c.env.DB);
  const body = await c.req.json();
  const { email } = body;

  try {
    const user = await db
      .select({
        two_factor_enabled: admin_users.two_factor_enabled
      })
      .from(admin_users)
      .where(eq(admin_users.email, email))
      .get();

    if (!user) {
      return c.json({
        status: 404,
        msg: "User not found",
        data: {
          two_factor_enabled: false
        }
      });
    }

    return c.json({
      status: 0,
      msg: "ok",
      data: {
        two_factor_enabled: user.two_factor_enabled
      }
    });
  } catch (error) {
    console.error("Error checking 2FA status:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: {
        two_factor_enabled: false
      }
    });
  }
});

// 修改登录接口
administrator.post("/login", async (c) => {
  const db = initDbConnect(c.env.DB);
  const body = await c.req.json();
  const { email, password, code } = body;

  try {
    const user = await db
      .select()
      .from(admin_users)
      .where(eq(admin_users.email, email))
      .get();

    if (!user || !compareSync(password, user.password)) {
      return c.json({
        status: 401,
        msg: "Invalid email or password",
        data: null
      });
    }

    // 如果启用了两步验证
    if (user.two_factor_enabled && user.two_factor_secret) {
      // 如果没有提供验证码
      if (!code) {
        return c.json({
          status: 401,
          msg: "Two-factor authentication code required",
          data: null
        });
      }

      // 验证两步证码
      const isValid = await TOTP.verify(code, user.two_factor_secret);

      if (!isValid) {
        return c.json({
          status: 401,
          msg: "Invalid verification code",
          data: null
        });
      }
    }

    // 生成 JWT token
    const token = await sign({
      id: user.id,
      email: user.email
    }, c.env.JWT_SECRET);

    return c.json({
      status: 0,
      msg: "ok",
      data: {
        token,
        email: user.email,
        id: user.id
      }
    });
  } catch (error) {
    console.error("Error logging in:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 直接开启两步验证
secure.post("/toggle-2fa", async (c) => {
  const db = initDbConnect(c.env.DB);
  const userId = c.get('jwtPayload').id;
  const body = await c.req.json();

  try {
    await db
      .update(admin_users)
      .set({ 
        two_factor_enabled: body.enabled
      })
      .where(eq(admin_users.id, userId))
      .execute();

    return c.json({
      status: 0,
      msg: "Two-factor authentication status updated",
      data: null
    });
  } catch (error) {
    console.error("Error toggling 2FA:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

administrator.route("/secure", secure)