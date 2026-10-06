import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SiteFooter } from '../components/SiteFooter';
import { login } from '../lib/auth';
import { useSession } from '../lib/session';
import { buttonVariants } from '@/components/ui/button';
import { brandClasses } from '../components/Layout';
import { cn } from '@/lib/utils';

const EFFECTIVE = 'October 4, 2026';
const COMPANY = 'Quo Vadimus Incorporated';

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

const mail = (addr: string) => <a href={`mailto:${addr}`}>{addr}</a>;

function LegalDoc({ title, intro, sections }: { title: string; intro: ReactNode; sections: Section[] }) {
  const { signedIn } = useSession();
  useEffect(() => {
    document.title = `${title} | Potluck`;
    return () => {
      document.title = 'Potluck: recipe videos to meal plans';
    };
  }, [title]);

  return (
    <div className="[--lp-max:1180px] min-h-[100dvh] [overflow-x:clip] [&_main]:max-w-[var(--lp-max)] [&_main]:mx-auto [&_main]:py-0 [&_main]:px-[var(--gutter)]">
      <a className="absolute left-3 -top-[60px] z-[var(--z-skip)] bg-ink text-ink-foreground py-2.5 px-4 rounded-full font-medium focus:top-3 focus:text-ink-foreground" href="#main">
        Skip to content
      </a>
      <header className="sticky top-0 z-[var(--z-sticky)] flex items-center gap-6 h-16 py-0 px-[max(var(--gutter),_calc((100vw_-_var(--lp-max))_/_2))] [background:color-mix(in_srgb,_var(--bg)_86%,_transparent)] [backdrop-filter:blur(12px)] border-b border-transparent">
        <Link to="/" className={cn(brandClasses, 'text-[1.5rem]')} aria-label="Potluck home">
          <img src="/icon.svg" alt="" width={28} height={28} className="rounded-[9px] shadow-paper transition-transform duration-300 ease-spring group-hover:-rotate-8 group-hover:scale-105" />
          <span className="max-[420px]:hidden">Potluck</span>
        </Link>
        {signedIn ? (
          <Link to="/book" className={buttonVariants({ size: 'sm' })}>
            Open Potluck
          </Link>
        ) : (
          <button type="button" className={buttonVariants({ size: 'sm' })} onClick={() => void login('/book')}>
            Sign in
          </button>
        )}
      </header>
      <main id="main" className="max-w-[760px] mx-auto pt-10 px-[var(--gutter)] pb-24">
        <header className="flex flex-col gap-2.5 pb-7 border-b border-border [&_h1]:tracking-[-0.035em] [&_h1]:text-[clamp(2.4rem,_5vw,_3.4rem)]">
          <h1>{title}</h1>
          <p className="text-muted-foreground text-[0.875rem]">Last updated {EFFECTIVE}</p>
          <div className="[&_p]:text-foreground-2 [&_p]:max-w-[62ch]">{intro}</div>
        </header>
        <nav className="py-6 px-0 border-b border-border [&_ol]:m-0 [&_ol]:pl-[1.4em] [&_ol]:[columns:2_220px] [&_ol]:gap-x-8 [&_ol]:text-[0.92rem] [&_li]:py-[3px] [&_li]:px-0 [&_li]:[break-inside:avoid] [&_a]:no-underline [&_a:hover]:underline" aria-label="Contents">
          <h2 className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Contents</h2>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <ol className="m-0 pl-[1.4em] [&>li]:pt-8 [&>li]:[scroll-margin-top:80px] [&>li::marker]:font-semibold [&>li::marker]:text-[1.15rem] [&_h2]:text-[1.15rem] [&_h2]:mb-3 [&_p]:text-foreground-2 [&_p]:max-w-[68ch] [&_p]:mt-0 [&_p]:mx-0 [&_p]:mb-3 [&_ul]:text-foreground-2 [&_ul]:max-w-[68ch] [&_ul]:mt-0 [&_ul]:mx-0 [&_ul]:mb-3 [&_ul]:pl-[1.2em] [&_li_li]:mb-1.5 [&_ul_li]:mb-1.5">
          {sections.map((s) => (
            <li key={s.id} id={s.id}>
              <h2>{s.title}</h2>
              {s.body}
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Terms of Service                                                                          */
/* ---------------------------------------------------------------------------------------- */

const TERMS: Section[] = [
  {
    id: 'agreement',
    title: 'Agreement to these terms',
    body: (
      <>
        <p>
          These Terms of Service are a binding agreement between you and {COMPANY} ("Quo Vadimus", "we", "us" or "our"), which
          operates Potluck at potluckhq.app and through our chat bots (together, the "Service"). By creating an account, sending
          content to a Potluck bot, or otherwise using the Service, you agree to these terms and to our{' '}
          <Link to="/privacy">Privacy Policy</Link>. If you do not agree, do not use the Service.
        </p>
        <p>
          <strong>
            The <a href="#arbitration">Dispute resolution and arbitration</a> section contains a binding arbitration agreement
            and a class action waiver. It affects how disputes are resolved. You may opt out within 30 days as described there.
          </strong>
        </p>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: 'Eligibility',
    body: (
      <>
        <p>You must be at least 13 years old to use the Service. The Service is not directed to children under 13.</p>
        <p>
          If you are under 18, you may use the Service only with the involvement and consent of a parent or legal guardian, who
          agrees to these terms on your behalf and is responsible for your use.
        </p>
        <p>You must be at least 18 years old, or the age of majority where you live, to buy a paid plan or AI credits.</p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account',
    body: (
      <>
        <p>
          You must give accurate information when you sign up and keep it current. You are responsible for keeping your sign-in
          details secure and for everything that happens under your account, including messages sent from chats you link to it.
        </p>
        <p>
          Tell us right away at {mail('support@potluckhq.app')} if you think someone has accessed your account without
          permission. We are not liable for losses caused by unauthorized use of your account.
        </p>
      </>
    ),
  },
  {
    id: 'communities',
    title: 'Communities',
    body: (
      <>
        <p>
          A community is a shared space for a household, workplace or group of friends. The person who creates a community is
          its owner. The owner is responsible for the community, decides who is invited, and pays for the community's plan and
          AI use.
        </p>
        <p>
          Recipes, meal plans, shopping lists, names and other content you add to a community are visible to its members.
          Admins can manage members and content. Only share what you are comfortable sharing with that group.
        </p>
        <p>
          If an owner deletes a community or their account, the community and its shared content are deleted for everyone.
        </p>
      </>
    ),
  },
  {
    id: 'content',
    title: 'Your content and license to us',
    body: (
      <>
        <p>
          You keep ownership of the content you submit, such as links, photos, videos, text, recipes, notes and edits ("Your
          Content").
        </p>
        <p>
          You grant Quo Vadimus a worldwide, non-exclusive, royalty-free, sublicensable and transferable license to host, store,
          copy, process, adapt, display and distribute Your Content as needed to operate, provide, secure and improve the
          Service. This includes sending Your Content to our service providers, such as our AI provider, to extract recipes and
          generate meal plans. The license ends when Your Content is deleted from the Service, except for copies kept in backups
          for a limited period, copies other members have already received, and copies we must keep by law.
        </p>
      </>
    ),
  },
  {
    id: 'third-party-content',
    title: 'Third-party videos, recipes and copyright',
    body: (
      <>
        <p>
          Much of what people send to Potluck was created by someone else, such as a creator's video or a recipe website. You
          are solely responsible for making sure you have the right to submit and use that content, and for how you use the
          resulting recipes. Use Potluck for your personal, non-commercial cooking.
        </p>
        <p>
          For recipes, we do not keep the videos you send. We download a video only long enough to analyze it, then delete it.
          We store the extracted recipe, a link to the original, the creator's name when available, and a preview image, which
          may be a still frame from the video.
        </p>
        <p>
          For cooking technique videos, which teach a method rather than a single dish, we keep a copy of the video and short
          clips from it so members of the communities you share the technique with can watch it in Potluck. These copies are
          private to those communities and are deleted when the technique is deleted or when its owner deletes their account. If
          you are a creator and want a stored video removed, contact support@potluckhq.app.
        </p>
        <p>
          We respect intellectual property rights and expect you to do the same. Potluck is not affiliated with or endorsed by
          TikTok, Instagram, YouTube, Facebook, Pinterest or any creator whose content you submit.
        </p>
      </>
    ),
  },
  {
    id: 'copyright',
    title: 'Copyright complaints',
    body: (
      <>
        <p>
          If you believe content on the Service infringes your copyright, send a notice to our designated agent at{' '}
          {mail('legal@potluckhq.app')} with: your physical or electronic signature; a description of the copyrighted work;
          where the material appears on the Service; your contact details; a statement that you have a good faith belief the use
          is not authorized by the owner, its agent or the law; and a statement, under penalty of perjury, that your notice is
          accurate and that you are the owner or authorized to act for the owner.
        </p>
        <p>
          We may remove or disable access to material in response to a notice. If your content is removed, you may send a
          counter-notice with the information required by 17 U.S.C. section 512(g). We terminate, in appropriate circumstances,
          the accounts of users who repeatedly infringe.
        </p>
      </>
    ),
  },
  {
    id: 'ai',
    title: 'AI-generated output',
    body: (
      <>
        <p>
          Potluck uses artificial intelligence to read videos, photos and text and to suggest meal plans. AI output can be
          incomplete or wrong. When a source does not state an amount, Potluck estimates one and marks it as estimated. Ingredient
          lists, quantities, cooking times, temperatures, nutrition estimates and allergen information may be inaccurate.
        </p>
        <p>
          <strong>
            You are responsible for checking every recipe before you cook it, including ingredients, allergens, cooking
            temperatures and food safety.
          </strong>{' '}
          Do not rely on Potluck to identify allergens or to make food safe for anyone with an allergy or medical condition.
        </p>
      </>
    ),
  },
  {
    id: 'health',
    title: 'Health and nutrition information',
    body: (
      <>
        <p>
          Nutrition estimates and planning options for GLP-1 medications, workout routines, diets and similar goals are general
          information only. <strong>They are not medical, nutritional or fitness advice</strong>, and Potluck is not a healthcare
          provider. Talk to a doctor, registered dietitian or other qualified professional before changing your diet, especially
          if you take medication, are pregnant, or have a medical condition.
        </p>
      </>
    ),
  },
  {
    id: 'messaging',
    title: 'Telegram, WhatsApp and text messages',
    body: (
      <>
        <p>
          When you link a Telegram, WhatsApp or SMS chat to your account, you agree to receive messages from Potluck in that
          chat about the recipes, plans and lists you request. Message frequency varies with how you use the Service. Message
          and data rates may apply.
        </p>
        <p>
          Reply STOP to stop text messages and HELP for help, or unlink the chat in your account settings. Mobile carriers and
          messaging platforms are not liable for delayed or undelivered messages. Your use of Telegram and WhatsApp is also
          governed by their own terms.
        </p>
      </>
    ),
  },
  {
    id: 'billing',
    title: 'Plans, billing and automatic renewal',
    body: (
      <>
        <p>
          Potluck offers a free plan and paid plans. Plan features and limits are shown on our pricing page and in your account.
        </p>
        <p>
          <strong>
            Paid plans renew automatically every month at the then-current price until you cancel. Your payment method is
            charged at the start of each billing period. You can cancel at any time in Account, then Manage billing.
          </strong>{' '}
          Cancellation takes effect at the end of the current billing period, and you keep paid features until then. We send
          the renewal terms with your order confirmation, as required by Florida Statutes section 501.165.
        </p>
        <p>
          Each paid plan includes a monthly AI allowance, currently $2.00 of AI use. Unused allowance does not roll over. AI
          credit packs can be bought once the allowance is used. Credits are non-refundable, non-transferable, have no cash
          value, and expire when your account is deleted or terminated.
        </p>
        <p>
          Except where required by law, all fees are non-refundable, including for partial billing periods and unused
          features. We may change prices or plan features with at least 30 days' notice. Price changes apply from your next
          billing period after the notice. Payments are processed by Stripe. You authorize us and Stripe to charge your payment
          method for all fees and applicable taxes.
        </p>
      </>
    ),
  },
  {
    id: 'limits',
    title: 'Plan limits and fair use',
    body: (
      <p>
        Plans include limits on communities, members, recipe imports and AI use. We may also apply reasonable rate limits to
        protect the Service. We may pause imports, AI features or messaging for any account whose use is unusually heavy,
        automated, or harmful to the Service or other users.
      </p>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>break any law, or submit content you do not have the right to use;</li>
          <li>submit content that is illegal, hateful, harassing, sexually explicit, or that exploits minors;</li>
          <li>use the Service to build a recipe database, scrape third-party sites, or resell or redistribute content at scale;</li>
          <li>automate imports or messages, or try to get around plan limits, rate limits or security features;</li>
          <li>reverse engineer, decompile or copy the Service, except where the law forbids this restriction;</li>
          <li>interfere with the Service, introduce malware, or access accounts or data that are not yours;</li>
          <li>impersonate anyone, or use the Service to send spam.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'termination',
    title: 'Suspension and termination',
    body: (
      <>
        <p>
          You can stop using the Service and delete your account at any time in Account settings.
        </p>
        <p>
          We may suspend or terminate your access, remove content, or end the Service, at any time and at our discretion,
          including if we believe you have violated these terms or created risk or legal exposure for us or others. Where
          reasonable, we will tell you. If we terminate a paid account without cause, we will refund any prepaid fees for the
          unused part of the current billing period. Sections that by their nature should survive termination will survive.
        </p>
      </>
    ),
  },
  {
    id: 'third-party-services',
    title: 'Third-party services',
    body: (
      <p>
        The Service relies on third parties, including Amazon Web Services, Google (Gemini), Stripe, Telegram and Meta
        (WhatsApp), and on the platforms that host the videos you submit. We are not responsible for third-party services, their
        availability, or their content, and some platforms may block or limit downloads at any time.
      </p>
    ),
  },
  {
    id: 'warranties',
    title: 'Disclaimer of warranties',
    body: (
      <p className="text-[0.86rem] tracking-[0.01em] text-foreground!">
        THE SERVICE AND ALL CONTENT, INCLUDING AI OUTPUT, ARE PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY
        KIND. TO THE FULLEST EXTENT PERMITTED BY LAW, QUO VADIMUS DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING
        WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT AND ACCURACY. WE DO NOT WARRANT
        THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE OR ERROR-FREE, OR THAT ANY RECIPE, AMOUNT, NUTRITION ESTIMATE OR MEAL PLAN
        IS ACCURATE, SAFE OR SUITABLE FOR YOU.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <>
        <p className="text-[0.86rem] tracking-[0.01em] text-foreground!">
          TO THE FULLEST EXTENT PERMITTED BY LAW, QUO VADIMUS AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS AND SUPPLIERS WILL
          NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF
          PROFITS, DATA, GOODWILL OR USE, ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS, EVEN IF ADVISED OF THEIR
          POSSIBILITY.
        </p>
        <p className="text-[0.86rem] tracking-[0.01em] text-foreground!">
          OUR TOTAL LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER
          OF THE AMOUNTS YOU PAID US IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM, OR US$50.
        </p>
        <p>
          Some places do not allow these exclusions or limits, so some of them may not apply to you. In that case, our liability
          is limited to the smallest amount the law allows.
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: 'Indemnification',
    body: (
      <p>
        You will defend, indemnify and hold harmless Quo Vadimus and its officers, directors, employees and agents from any
        claims, damages, losses, liabilities, costs and expenses, including reasonable attorneys' fees, arising out of Your
        Content, your use of the Service, your violation of these terms, or your violation of any law or the rights of a third
        party, including a creator's copyright.
      </p>
    ),
  },
  {
    id: 'arbitration',
    title: 'Dispute resolution and arbitration',
    body: (
      <>
        <p>
          <strong>Informal resolution first.</strong> Before filing a claim, you agree to email {mail('legal@potluckhq.app')} with
          a description of the dispute and try to resolve it informally for at least 30 days.
        </p>
        <p>
          <strong>Binding individual arbitration.</strong> Any dispute, claim or controversy arising out of or relating to these
          terms or the Service will be resolved by binding individual arbitration administered by the American Arbitration
          Association under its Consumer Arbitration Rules. The arbitration will be seated in the State of Florida, and may be
          conducted by video or on written submissions where the rules allow. The arbitrator, not a court, decides questions about
          the scope and enforceability of this agreement to arbitrate. The Federal Arbitration Act governs this section.
        </p>
        <p>
          <strong>Exceptions.</strong> Either party may bring an individual claim in small claims court instead. Either party may
          seek injunctive or other equitable relief in court to protect its intellectual property rights.
        </p>
        <p className="text-[0.86rem] tracking-[0.01em] text-foreground!">
          YOU AND QUO VADIMUS EACH WAIVE THE RIGHT TO A JURY TRIAL AND TO PARTICIPATE IN A CLASS ACTION, CLASS ARBITRATION OR
          REPRESENTATIVE PROCEEDING. CLAIMS MAY BE BROUGHT ONLY IN AN INDIVIDUAL CAPACITY.
        </p>
        <p>
          <strong>30-day opt-out.</strong> You may opt out of this arbitration agreement by emailing {mail('legal@potluckhq.app')}{' '}
          within 30 days after you first accept these terms, with your name, the email on your account, and a clear statement that
          you opt out of arbitration.
        </p>
        <p>
          <strong>Time limit.</strong> To the extent permitted by law, any claim must be brought within one year after it arises,
          or it is permanently barred.
        </p>
        <p>
          If the class action waiver is found unenforceable for a claim, that claim must be decided in court, not arbitration.
        </p>
      </>
    ),
  },
  {
    id: 'law',
    title: 'Governing law and venue',
    body: (
      <p>
        These terms are governed by the laws of the State of Florida and applicable federal law, without regard to conflict of
        law rules. For any matter not subject to arbitration, you and Quo Vadimus agree to the exclusive jurisdiction and venue
        of the state and federal courts located in the State of Florida.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        We may update these terms from time to time. We will post the new version here and update the date above, and for
        material changes we will also notify you by email or in the Service. Changes take effect when posted, unless we say
        otherwise. If you keep using the Service after changes take effect, you accept the updated terms.
      </p>
    ),
  },
  {
    id: 'general',
    title: 'General terms',
    body: (
      <ul>
        <li>
          <strong>Assignment.</strong> You may not transfer these terms without our written consent. We may assign them at any
          time, including in a merger, acquisition or sale of assets.
        </li>
        <li>
          <strong>Severability.</strong> If any part of these terms is found unenforceable, the rest stays in effect.
        </li>
        <li>
          <strong>Entire agreement.</strong> These terms and the Privacy Policy are the entire agreement between you and us
          about the Service.
        </li>
        <li>
          <strong>No waiver.</strong> Our failure to enforce a provision is not a waiver of our right to do so later.
        </li>
        <li>
          <strong>Force majeure.</strong> We are not liable for delays or failures caused by events beyond our reasonable
          control, including outages of internet, cloud, AI or messaging providers.
        </li>
        <li>
          <strong>Export.</strong> You may not use the Service in violation of United States export control or sanctions laws.
        </li>
      </ul>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        Questions about these terms: {mail('legal@potluckhq.app')}. Help with your account: {mail('support@potluckhq.app')}.
      </p>
    ),
  },
];

/* ---------------------------------------------------------------------------------------- */
/* Privacy Policy                                                                            */
/* ---------------------------------------------------------------------------------------- */

const PRIVACY: Section[] = [
  {
    id: 'collect',
    title: 'Information we collect',
    body: (
      <>
        <p>We collect only what we need to run Potluck:</p>
        <ul>
          <li>
            <strong>Account details:</strong> your email address and display name, and sign-in information managed by Amazon
            Cognito.
          </li>
          <li>
            <strong>Linked chats:</strong> your Telegram chat ID, or the phone number you use with WhatsApp or SMS, when you link
            a chat.
          </li>
          <li>
            <strong>What you submit:</strong> links, photos, videos and text you send us, and the recipes, edits, meal plans,
            shopping lists and notes you create.
          </li>
          <li>
            <strong>Diet profile:</strong> allergies, diets, dislikes, goals and protein targets you choose to add. If you turn
            on the GLP-1 option, we treat that as health-related information. We collect it only with your consent and use it
            only to tailor meal suggestions.
          </li>
          <li>
            <strong>Community information:</strong> the communities you join, your role, and invitations.
          </li>
          <li>
            <strong>Usage and billing records:</strong> import counts, AI usage and cost records, your plan, and your Stripe
            customer reference. Stripe handles card details. We never see or store your full card number.
          </li>
          <li>
            <strong>Technical data:</strong> logs such as IP address, device and browser details, and error reports, used for
            security and troubleshooting.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'use',
    title: 'How we use information',
    body: (
      <ul>
        <li>to provide the Service: extract recipes, share them with your communities, build plans and shopping lists, and reply in your linked chats;</li>
        <li>to process payments, apply plan limits, and meter AI usage;</li>
        <li>to send service messages such as verification codes, invitations, receipts and important notices;</li>
        <li>to keep the Service secure, prevent abuse and fraud, and fix problems;</li>
        <li>to improve the Service, using aggregated or de-identified information where possible;</li>
        <li>to comply with law and enforce our <Link to="/terms">Terms</Link>.</li>
      </ul>
    ),
  },
  {
    id: 'ai',
    title: 'AI processing',
    body: (
      <p>
        To extract recipes and suggest meal plans, we send the relevant content to Google's Gemini AI service. This can include
        a video, photos, a caption, page text, your community's recipe titles, and the diet profiles of community members. We
        use Google's paid API, and we do not use your content to train our own AI models.
      </p>
    ),
  },
  {
    id: 'sharing',
    title: 'How information is shared',
    body: (
      <>
        <p>
          <strong>We do not sell your personal information, and we do not share it for targeted advertising.</strong>
        </p>
        <p>We share information only:</p>
        <ul>
          <li>
            <strong>With your communities:</strong> members see the recipes, plans, lists and display names shared in that
            community. Community owners and admins see the member list.
          </li>
          <li>
            <strong>With service providers</strong> who process data for us under contract: Amazon Web Services (hosting,
            database, sign-in, email and AWS End User Messaging for SMS), Google (Gemini AI), Stripe (payments), Telegram and
            Meta (WhatsApp) for chats you link.
          </li>
          <li>
            <strong>For legal reasons:</strong> to comply with law or legal process, to protect the rights, safety and property
            of Quo Vadimus, our users or others, or to enforce our terms.
          </li>
          <li>
            <strong>In a business transfer:</strong> as part of a merger, acquisition, financing or sale of assets, subject to
            this policy.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep information',
    body: (
      <ul>
        <li>Recipe videos are never stored. They are deleted as soon as a recipe is extracted.</li>
        <li>
          Technique videos and their clips are kept for playback by the communities they are shared with, until the technique
          or its owner's account is deleted.
        </li>
        <li>Photos and videos you upload are deleted once processing finishes, and in any case within 7 days.</li>
        <li>Import records are kept for 30 days.</li>
        <li>AI usage records are kept for up to 400 days for billing and abuse prevention.</li>
        <li>Recipes, plans, lists and profile data are kept until you delete them or your account.</li>
        <li>
          Backups and logs may keep copies for a limited time after deletion. We keep billing records as long as tax and
          accounting laws require.
        </li>
      </ul>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <p>
        We use encryption in transit and at rest, access controls, and least-privilege permissions to protect your information.
        No system is perfectly secure. If a breach of security affects your personal information, we will notify you and the
        appropriate authorities as required by law, including Florida Statutes section 501.171.
      </p>
    ),
  },
  {
    id: 'choices',
    title: 'Your choices and rights',
    body: (
      <>
        <ul>
          <li>
            <strong>Access and export:</strong> download a copy of your data from Account, then Your data.
          </li>
          <li>
            <strong>Correct:</strong> edit your profile, diet profile and recipes in the app.
          </li>
          <li>
            <strong>Delete:</strong> delete your account from Account, then Your data. This deletes your recipes, removes you
            from communities, and deletes communities you own.
          </li>
          <li>
            <strong>Messages:</strong> unlink a chat in Account settings, or reply STOP to text messages.
          </li>
        </ul>
        <p>
          Depending on where you live, you may have additional privacy rights. The Florida Digital Bill of Rights generally does
          not apply to a business of our size, but we honor reasonable requests to access, correct or delete personal
          information wherever you live. Email {mail('privacy@potluckhq.app')}. We may need to verify your identity, and we will
          not discriminate against you for making a request.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        Potluck is not directed to children under 13, and we do not knowingly collect personal information from them. If you
        believe a child under 13 has given us personal information, email {mail('privacy@potluckhq.app')} and we will delete it.
      </p>
    ),
  },
  {
    id: 'international',
    title: 'Where information is processed',
    body: (
      <p>
        Quo Vadimus is based in the United States, and we process and store information in the United States. If you use
        Potluck from elsewhere, you understand that your information will be transferred to and processed in the United States.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and local storage',
    body: (
      <p>
        We use browser storage only to keep you signed in and to remember preferences such as your selected community. We do not
        use advertising cookies or third-party ad trackers.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this policy. We will post the new version here and update the date above, and we will notify you of
        material changes by email or in the Service.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        Privacy questions and requests: {mail('privacy@potluckhq.app')}. Everything else: {mail('legal@potluckhq.app')}.
      </p>
    ),
  },
];

export function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      intro={
        <p>
          These terms explain the rules for using Potluck, which is operated by {COMPANY}. Please read them carefully, especially
          the sections on AI output, billing, limitation of liability and arbitration.
        </p>
      }
      sections={TERMS}
    />
  );
}

export function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what information {COMPANY} collects when you use Potluck, how we use it, and the choices you
          have. It is part of our <Link to="/terms">Terms of Service</Link>.
        </p>
      }
      sections={PRIVACY}
    />
  );
}
