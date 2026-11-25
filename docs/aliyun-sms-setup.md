# 阿里云短信接入指引

> 本文分两部分：**第 0 节教你怎么在控制台把数据拿到**，后面几节是代码侧怎么用、以及踩过的坑。

## 0. 控制台逐步操作（拿到 6 个值）

需要拿到的最终结果：

```ini
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_REGION=cn-hangzhou
ALIYUN_SIGN_NAME=
ALIYUN_TEMPLATE_ARRIVAL=SMS_XXXXXXXX   # 你已有
ALIYUN_TEMPLATE_VERIFY=                 # 需新申请
```

### 0.1 前置：账号与实名

1. 打开 <https://dysms.console.aliyun.com/>（用你的阿里云账号登录）。
2. 首次进入会要求**开通短信服务**，同意协议即可（不收费，发送时才计费）。
3. 左侧「国内消息 → 资质管理」：个人认证账号传身份证，企业认证传营业执照。
   **没有已审核的资质，签名和模板都无法申请。** 审核通常几分钟到 2 小时。

### 0.2 签名（`ALIYUN_SIGN_NAME`）

左侧「国内消息 → 签名管理 → 添加签名」：

| 字段 | 怎么填 |
|---|---|
| 签名名称 | 用户短信里看到的 `【xxx】`，2–12 字，例如 `取餐提醒` 或你的公司简称 |
| 适用场景 | 选「验证码」+「通知」 |
| 签名来源 | 优先「企业名/事业单位名」（用营业执照）；个人账号可选「已备案网站」「已上线 App」 |
| 证明 | 按来源上传对应材料 |

提交后审核约 2 小时。**通过后还要做运营商实名报备**（新规），7–10 个工作日；
未报备前发送会返回 `PORT_NOT_REGISTERED`。这一步只能等，没有捷径。

> 签名必须与审核通过的**完全一致**（包括中英文、空格），差一个字都会报 `isv.SMS_SIGNATURE_ILLEGAL`。

### 0.3 模板（两个）

左侧「国内消息 → 模板管理 → 添加模板」。本系统需要两个：

**① 到柜通知（你已有 `SMS_XXXXXXXX`）**

```
模板名称：外卖通知
模板类型：通知
模板内容：已到达外卖柜${cabCode},编号${SN},请在${box_sn}号口取餐
```

**② 验证码（必须新申请）**

```
模板名称：取餐提醒验证码
模板类型：验证码
模板内容：您的验证码为${code}，5分钟内有效。请勿泄露。
```

⚠️ **变量类型一定要选「文本/字符串」，不要选「快递单号」「数字」**：
`cabCode` 形如 `SYA61026AP`（含字母）、柜号形如 `A-07`（含横线），
选数字类型会被阿里云的格式校验拦下，报变量不合法。

审核通过后，模板列表里会显示形如 `SMS_XXXXXXXX` 的 CODE，把它填进 `.env`。

### 0.4 AccessKey（`ALIYUN_ACCESS_KEY_ID` / `_SECRET`）

**不要用主账号 AK。** 用 RAM 子账号，只授短信权限：

1. 打开 <https://ram.console.aliyun.com/users> → 「创建用户」。
2. 登录名称填 `meal-reminder-sms`；访问方式勾选 **「使用永久 AccessKey 访问」**（不要勾控制台登录）。
3. 创建后会**一次性**显示 `AccessKey ID` 与 `AccessKey Secret` —— Secret 只显示这一次，立刻复制保存。
4. 回到用户列表 → 点该用户 → 「权限管理 → 新增授权 → 自定义策略」。
   若没有现成策略，先到「权限策略 → 创建策略 → 脚本编辑」粘贴下面这段（最小权限）：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dysms:SendSms", "dysms:QuerySendDetails"],
      "Resource": "*"
    }
  ]
}
```

策略名称随意（如 `MealReminderSmsOnly`），创建后授权给该用户。

> 用子账号的好处：AK 泄露只能发短信，不能动你的 ECS/OSS/域名。

### 0.5 先自测一次（强烈建议）

在「国内消息 → 发送测试」里，选你的签名 + 到柜模板 + 填三个变量（如 `SYA61026AP` / `2680` / `A-07`），
发给自己的手机。**能收到再往下走**，否则代码里也一定失败，只是错误信息更难读。

### 0.6 把 6 个值给我

把上面 4 个自取值 + 2 个模板 CODE 发我（或自己写进服务器 `/opt/meal-reminder/.env`），
我会把 `ALIYUN_DRY_RUN` 改成 `false` 并重启服务端。之后在 App/网页「设置 → 绑定手机号」
走一次真实验证码，就能确认全链路。

---

## 1. 已确定的事实（来自旧版项目）

| 项 | 值 |
|---|---|
| 产品 | 短信服务 Dysmsapi，API 版本 `2017-05-25` |
| 接口 | `SendSms` |
| 到柜通知模板 | `SMS_XXXXXXXX` |
| 模板内容 | `已到达外卖柜${cabCode},编号${SN},请在${box_sn}号口取餐` |
| 变量 | `cabCode` / `SN` / `box_sn`（控制台标注为「快递单号/快递单号/其他号码」） |
| 单号码限频 | 20 条/天（阿里云硬限制，超限返回 `isv.BUSINESS_LIMIT_CONTROL`） |
| 计费 | 仅发送成功计费 |

## 2. ⚠️ 还需要一个「验证码模板」

**到柜通知模板不能拿来发验证码**——它的文案是「已到达外卖柜…」，与「您的验证码是 123456」完全不匹配，阿里云会因模板与内容不符拒绝，用户也会困惑。

手机号绑定需要**第二套模板**，例如：

```
模板名称：取餐提醒验证码
模板内容：您的验证码为${code}，5分钟内有效。请勿泄露。
模板类型：验证码
```

申请路径：短信服务控制台 → 模板管理 → 添加模板 → 选「验证码」类型 → 提交审核（通常 2–4 小时）。

拿到 CODE 后填进 `deploy/.env`：

```ini
ALIYUN_TEMPLATE_ARRIVAL=SMS_XXXXXXXX
ALIYUN_TEMPLATE_VERIFY=SMS_xxxxxxx   # ← 需要你新申请的验证码模板
```

> 如果暂时没有验证码模板：手机号绑定功能会返回 `SMS_TEMPLATE_NOT_CONFIGURED`，其余功能不受影响。可以先只做到柜通知。

## 3. 环境变量

```ini
# 阿里云账号
ALIYUN_ACCESS_KEY_ID=LTAI...
ALIYUN_ACCESS_KEY_SECRET=...
ALIYUN_REGION=cn-hangzhou

# 签名（必须与已审核通过的签名完全一致）
ALIYUN_SIGN_NAME=你的签名

# 模板
ALIYUN_TEMPLATE_ARRIVAL=SMS_XXXXXXXX
ALIYUN_TEMPLATE_VERIFY=SMS_xxxxxxx

# 调试：设 true 时只写日志不真发（本地开发用）
ALIYUN_DRY_RUN=false
```

## 4. 代码侧

- SDK：`@alicloud/dysmsapi20170525`（官方 Node SDK）+ `@alicloud/openapi-client`。
- 单例 client，`SendSmsRequest` 填 `phoneNumbers`、`signName`、`templateCode`、`templateParam`（JSON 字符串）。
- 到柜通知的参数映射（固定，不让用户配）：
  ```json
  { "cabCode": "<Reminder.cabCode>", "SN": "<SystemSetting.lockerDeviceSn>", "box_sn": "<Reminder.cabinet>" }
  ```
- 验证码：`{ "code": "123456" }`。
- 返回值处理：
  - `Code === "OK"` → `SmsLog.status=SENT`，记 `BizId`。
  - `Code` 含 `BUSINESS_LIMIT_CONTROL` / `THROTTLING` / 超时 → 可重试，最多 2 次，指数退避（1s、3s）。
  - `isv.MOBILE_NUMBER_ILLEGAL`、`isv.SMS_TEMPLATE_ILLEGAL`、`isv.SMS_SIGNATURE_ILLEGAL` → 不可重试，`FAILED` + 管理员告警。
- 号码格式：大陆 11 位，`^1[3-9]\d{9}$`；入库前统一去空格与 `+86` 前缀。

## 5. 配额与防刷

- 到柜通知：每个 `Reminder` 只发一次（`notifiedAt` 保证）。
- 验证码：同号 60 秒 1 条、每天 5 条；全局每小时上限 100 条（`SystemSetting` 可调）。
- 日配额统计：`SELECT count(*) FROM SmsLog WHERE phone=? AND status='SENT' AND createdAt >= 今日0点`，≥20 则跳过并告警。

## 6. 自测（不需要真实号码也能验证链路）

```bash
# 只校验签名与参数，不真发
ALIYUN_DRY_RUN=true pnpm --filter server test:sms

# 真实发一条到你的手机
pnpm --filter server sms:test -- --phone 13800138000 --template arrival
```

## 8. 可直接复制的模板内容

### 8.1 到柜通知模板（替换 `SMS_XXXXXXXX` 或新建）

| 字段 | 填写内容 |
|---|---|
| 模板名称 | `外卖入柜通知` |
| 模板类型 | 通知短信 |
| 模板内容 | `已到达外卖柜${cabCode},编号${SN},请在${box_sn}号口取餐` |
| 变量 1 | 名称 `cabCode`，类型 **文本/字符串**，示例 `SYA61026AP` |
| 变量 2 | 名称 `SN`，类型 **文本/字符串**，示例 `2680` |
| 变量 3 | 名称 `box_sn`，类型 **文本/字符串**，示例 `A-07` |
| 场景说明 | `用户外卖送达取餐柜后，通知用户前往对应柜口取餐` |

> 三个变量**必须**都选「文本/字符串」。选「快递单号」「其他号码」「数字」都会因格式校验报
> `isv.TEMPLATE_PARAMS_ILLEGAL`（已实测：`1234` 与 `A-1234` 均被拒）。

可选更通顺的文案（需同样审核）：

```
您的外卖已到达取餐柜${cabCode}，柜号${box_sn}，取餐码${SN}，请及时取餐。
```

### 8.2 验证码模板

| 字段 | 填写内容 |
|---|---|
| 模板名称 | `取餐提醒验证码` |
| 模板类型 | 验证码 |
| 模板内容 | `您的验证码为${code}，5分钟内有效。请勿泄露。` |
| 变量 | 名称 `code`，类型 **数字**，示例 `123456` |
| 场景说明 | `用户绑定手机号时进行身份验证` |

### 8.3 代码侧实际发送的参数

到柜通知（`SmsService.sendArrival`）：

```json
{ "cabCode": "<任务里的柜机 cabCode>", "SN": "<系统设置 lockerDeviceSn，默认 2680>", "box_sn": "<接口返回的柜号>" }
```

验证码（`SmsService.sendVerifyCode`）：

```json
{ "code": "123456" }
```

变量名必须与模板里的 `${...}` 完全一致（区分大小写：`SN` 是大写，`box_sn` 是下划线小写）。

## 9. 常见错误码对照

| 返回码 | 含义 | 处理 |
|---|---|---|
| `OK` | 发送成功 | — |
| `isv.SMS_SIGNATURE_ILLEGAL` | 签名不存在或不匹配 | 核对 `ALIYUN_SIGN_NAME` 与审核通过的签名逐字一致 |
| `isv.SMS_TEMPLATE_ILLEGAL` | 模板不存在或与签名不匹配 | 核对模板 CODE；模板必须与签名在同一账号下 |
| `isv.MOBILE_NUMBER_ILLEGAL` | 号码格式错 | 11 位大陆手机号，不要带 `+86` |
| `isv.BUSINESS_LIMIT_CONTROL` | 触发流控（单号 20 条/天、单号 1 条/分钟等） | 服务端已做日配额与去重，仍出现就说明有并发 |
| `isv.AMOUNT_NOT_ENOUGH` | 账户余额不足 | 充值（约 ¥0.045/条） |
| `PORT_NOT_REGISTERED` | 签名未完成运营商实名报备 | 等报备通过（7–10 工作日），无代码解法 |
| `isv.TEMPLATE_PARAMS_ILLEGAL` | 变量值不符合模板变量类型 | 把模板变量类型改成「文本」，见 0.3 |
| `isp.RAM_PERMISSION_DENY` | 子账号无权限 | 检查 0.4 的策略是否已授权并生效 |


- 个人认证账号的「自用资质」无法通过签名实名制报备；签名来源不再支持公众号/小程序/已备案网站/已上线 APP。
- 签名需运营商实名报备，7–10 个工作日；未报备返回 `PORT_NOT_REGISTERED`。
- 模板变量被标注为「快递单号/其他号码」时，含字母的 `cabCode`（如 `SYA61026AP`）或柜号（如 `A-07`）可能触发格式校验失败。
  **建议**：到阿里云控制台把 `SMS_XXXXXXXX` 的变量类型改成「普通文本」，否则 `cabCode=SYA61026AP` 可能发不出去。
  这是旧版就存在的隐患，我没有权限替你改控制台配置。
