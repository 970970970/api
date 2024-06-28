/*
CREATE TABLE languages (
    id INT PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    name VARCHAR(50) NOT NULL,
    flag VARCHAR(10) NOT NULL
    -- id: 主键, 唯一标识
    -- code: 语言-国家代码, 如 'zh-CN' 代表中国中文, 'en-US' 代表美国英语
    -- name: 语言名称, 如 'Chinese'，'English'
    -- flagEmoji: 国旗emoji, 如 🇨🇳 代表中国，🇺🇸 代表美国
);
*/

INSERT INTO languages (id, code, name, flag)
VALUES
(1, 'en-US', 'English', '🇺🇸'),  -- 英语
(2, 'zh-CN', 'Chinese', '🇨🇳'),  -- 汉语
(3, 'hi-IN', 'Hindi', '🇮🇳'),  -- 印地语
(4, 'es-ES', 'Spanish', '🇪🇸'),  -- 西班牙语
(5, 'fr-FR', 'French', '🇫🇷'),  -- 法语
(6, 'ar-SA', 'Arabic', '🇸🇦'),  -- 阿拉伯语
(7, 'bn-BD', 'Bengali', '🇧🇩'),  -- 孟加拉语
(8, 'ru-RU', 'Russian', '🇷🇺'),  -- 俄语
(9, 'pt-BR', 'Portuguese', '🇧🇷'),  -- 葡萄牙语
(10, 'id-ID', 'Indonesian', '🇮🇩'),  -- 印尼语
(11, 'ur-PK', 'Urdu', '🇵🇰'),  -- 乌尔都语
(12, 'de-DE', 'German', '🇩🇪'),  -- 德语
(13, 'ja-JP', 'Japanese', '🇯🇵'),  -- 日语
(14, 'tr-TR', 'Turkish', '🇹🇷'),  -- 土耳其语
(15, 'ko-KR', 'Korean', '🇰🇷'),  -- 韩语
(16, 'vi-VN', 'Vietnamese', '🇻🇳'),  -- 越南语
(17, 'it-IT', 'Italian', '🇮🇹'),  -- 意大利语
(18, 'th-TH', 'Thai', '🇹🇭'),  -- 泰语
(19, 'fa-IR', 'Persian', '🇮🇷'),  -- 波斯语
(20, 'nl-NL', 'Dutch', '🇳🇱');  -- 荷兰语
