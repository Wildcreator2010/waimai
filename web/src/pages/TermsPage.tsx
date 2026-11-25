import { Link } from 'react-router-dom';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/PageHeader';

const UPDATED_AT = '2026-11-12';
const VERSION = '2026-11-12';

/**
 * 用户协议。注册时必须勾选同意，服务端会记录同意时间与版本（User.termsAcceptedAt / termsVersion）。
 * 注意：这是工程实现所需的文本，正式上线前建议由法务复核。
 */
export function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-8">
      <PageHeader
        title="用户协议"
        description={`版本 ${VERSION} · 更新于 ${UPDATED_AT}`}
      />

      <Card className="prose prose-slate max-w-none text-sm leading-7">
        <h2 className="text-base font-semibold text-slate-900">一、服务说明</h2>
        <p>
          「取餐提醒」通过服务端按固定间隔查询取餐柜开放接口，在你设置的取餐码出现入柜记录时，
          通过应用推送、ntfy 推送与短信三种方式提醒你取餐。本服务仅提供信息提醒，
          <strong>不代你下单、不代你取餐、不保证取餐柜运营方的任何服务</strong>。
        </p>

        <h2 className="mt-6 text-base font-semibold text-slate-900">二、账号与注册</h2>
        <p>
          注册需要管理员发放的邀请码，且邀请码绑定你的邮箱。你需要提供真实可用的邮箱以完成验证；
          密码由服务端以加盐哈希方式存储，任何情况下都不会以明文保存或展示。
          你应妥善保管账号与密码，因账号泄露造成的损失由你自行承担。
        </p>

        <h2 className="mt-6 text-base font-semibold text-slate-900">三、提醒的准确性</h2>
        <p>
          提醒依赖第三方取餐柜接口，可能因接口变更、网络异常、凭证失效、取餐柜运营方故障等原因
          延迟或失败。<strong>本服务不承诺提醒必达、必准时</strong>。
          你应同时留意外卖平台自身的通知，不要把本服务作为唯一依据。
        </p>
        <p>
          为避免把「上一单」误判为「这一单」，系统在任务创建后的第一次查询只记录基线，
          之后仅在出现与基线不同的入柜记录时提醒。若你在同一柜机用同一取餐码连续下单，
          第二次可能不会触发提醒。
        </p>

        <h2 className="mt-6 text-base font-semibold text-slate-900">四、一键开箱</h2>
        <p>
          一键开箱会调用取餐柜开放接口发送<strong>真实的开门指令</strong>，属于物理操作。你确认并同意：
        </p>
        <ul className="list-disc pl-6">
          <li>仅在你本人已入柜的任务上操作，且确认柜前无人、安全后再执行；</li>
          <li>开箱结果取决于取餐柜运营方，可能失败或延迟，本服务不承担因此产生的任何后果；</li>
          <li>系统对同一任务限制开箱次数与频率，并记录审计日志；</li>
          <li>因误操作、他人代操作或网络延迟导致的柜门异常、物品丢失，由操作者自行负责。</li>
        </ul>

        <h2 className="mt-6 text-base font-semibold text-slate-900">五、短信与费用</h2>
        <p>
          短信通过阿里云短信服务发送。你绑定的手机号每天最多接收 20 条（服务商限制），
          超出后系统会跳过并通知管理员。短信费用由服务提供方承担，你无需支付；
          若未来调整，会提前在本协议中说明。
        </p>

        <h2 className="mt-6 text-base font-semibold text-slate-900">六、数据与隐私</h2>
        <ul className="list-disc pl-6">
          <li>我们收集：邮箱、密码哈希、手机号（你主动绑定）、取餐码与柜机编号、推送设备标识。</li>
          <li>取餐柜凭证（MemberToken）以 AES-256-GCM 加密存储，任何接口都不返回明文。</li>
          <li>提醒任务与事件保留 30 天，短信流水与审计日志保留 90 天，到期自动删除。</li>
          <li>管理员看不到其他用户的提醒任务；只有你本人能查看自己的取餐码与任务详情。</li>
          <li>我们不会将你的数据出售或提供给第三方，除非法律要求。</li>
        </ul>

        <h2 className="mt-6 text-base font-semibold text-slate-900">七、使用规范</h2>
        <p>你不得：</p>
        <ul className="list-disc pl-6">
          <li>使用本服务查询、开箱他人柜格或他人订单；</li>
          <li>对接口进行扫描、压测、批量注册或其他滥用行为；</li>
          <li>将账号转借他人，或用于任何违法用途。</li>
        </ul>
        <p>违反上述规范的账号，管理员有权停用或删除，且不退还任何费用（本服务免费）。</p>

        <h2 className="mt-6 text-base font-semibold text-slate-900">八、服务变更与终止</h2>
        <p>
          本服务可能因维护、接口变更或运营调整而暂停或终止。我们会尽力提前通知。
          你可以随时停止使用；删除账号请联系管理员。
        </p>

        <h2 className="mt-6 text-base font-semibold text-slate-900">九、协议更新</h2>
        <p>
          协议更新后会在本页更新版本号与日期。注册时系统会记录你同意的版本；
          重大变更可能要求你重新确认。
        </p>

        <h2 className="mt-6 text-base font-semibold text-slate-900">十、免责</h2>
        <p>
          在法律允许的范围内，本服务按「现状」提供，不对因使用或无法使用本服务产生的
          间接损失、错过取餐、餐品变质等承担责任。
        </p>
      </Card>

      <p className="text-center text-sm text-slate-500">
        <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
          返回注册
        </Link>
      </p>
    </div>
  );
}
