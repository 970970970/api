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

  static async generateSecret(): Promise<string> {
    const array = new Uint8Array(20);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 32);
  }

  static async generateTOTP(secret: string, counter: number): Promise<string> {
    // 将 secret 解码为 Uint8Array
    const secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
    
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
  const db = initDbConnect(c.env.DB);
  const userId = c.get('jwtPayload').id;

  try {
    // 生成密钥
    const secret = await TOTP.generateSecret();
    
    // 更新用户记录
    await db
      .update(admin_users)
      .set({ 
        two_factor_secret: secret,
        two_factor_enabled: false
      })
      .where(eq(admin_users.id, userId))
      .execute();

    // 生成 TOTP URI
    const email = c.get('jwtPayload').email;
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
    console.error("Error enabling 2FA:", error);
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
  const { code } = body;

  try {
    const user = await db
      .select()
      .from(admin_users)
      .where(eq(admin_users.id, userId))
      .get();

    if (!user?.two_factor_secret) {
      return c.json({
        status: 400,
        msg: "Two-factor authentication not initialized",
        data: null
      });
    }

    // 验证码是否正确
    const isValid = await TOTP.verify(code, user.two_factor_secret);

    if (!isValid) {
      return c.json({
        status: 400,
        msg: "Invalid verification code",
        data: null
      });
    }

    // 启用两步验证
    await db
      .update(admin_users)
      .set({ two_factor_enabled: true })
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

// 将登录接口移到 administrator 路由组
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
          status: 202,
          msg: "Two-factor authentication required",
          data: {
            require_2fa: true
          }
        });
      }

      // 验证两步验证码
      const isValid = await TOTP.verify(code, user.two_factor_secret);

      if (!isValid) {
        return c.json({
          status: 401,
          msg: "Invalid verification code",
          data: null
        });
      }
    } else if (user.two_factor_enabled) {
      // 如果启用了两步验证但没有密钥，这是一个错误状态
      return c.json({
        status: 500,
        msg: "Two-factor authentication configuration error",
        data: null
      });
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

administrator.route("/secure", secure)