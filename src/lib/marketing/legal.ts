export const LEGAL = {
  product: 'Noxen Cloud',
  operator: 'Holdfast Cyber',
  contactEmail: 'dustin@holdfastcyber.us',
  updated: 'September 23, 2026',
  origin: 'https://noxencloud.com',
} as const;

export const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Who we are',
    body: `${LEGAL.product} is a hosted project command center operated by ${LEGAL.operator}. Questions: ${LEGAL.contactEmail}.`,
  },
  {
    title: 'What we collect',
    body: 'Account email and sign-in identity (via Clerk), the projects and workspace data you enter, billing identifiers (via Stripe) if you subscribe, uptime target URLs you choose to monitor, and basic request logs needed to run the service.',
  },
  {
    title: 'Who processes it',
    body: 'Clerk (authentication), Stripe (payments), Neon (database), Cloudflare (hosting), and Resend (transactional email). We do not sell your data.',
  },
  {
    title: 'Cookies',
    body: 'We use session cookies so you stay signed in. The site will not work without them. We do not run advertising trackers.',
  },
  {
    title: 'Retention and deletion',
    body: 'We keep account and project data while the account exists. You can ask us to delete the account and its workspaces; billing records Stripe is required to keep may remain with Stripe.',
  },
  {
    title: 'Contact',
    body: `Email ${LEGAL.contactEmail}. Enterprise data-processing terms are available on request.`,
  },
];

export const TERMS_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'The service',
    body: `${LEGAL.product} is a hosted workspace for tracking projects, a daily brief, optional uptime checks, and a Pro copilot. It is provided as-is. We may change features as the product develops.`,
  },
  {
    title: 'Your account',
    body: 'You must be old enough to form a contract and are responsible for what you put in the workspace. Do not use the service to attack, scan, or monitor systems you do not own or have permission to check.',
  },
  {
    title: 'Plans and billing',
    body: 'Free covers up to five projects. Pro is billed by Stripe at the prices shown on the pricing page. Yearly billing is available at checkout. Cancel anytime through the Stripe billing portal; access continues through the end of the paid period.',
  },
  {
    title: 'Acceptable use',
    body: 'No abuse of uptime monitors (rapid re-targeting, scanning third parties, or using us as a proxy), no malware, and no attempt to break into the service or other tenants’ data.',
  },
  {
    title: 'Limitation',
    body: 'The service may go down. We are not liable for lost profits or data beyond the amount you paid us in the previous three months. Some places do not allow these limits; they apply to the extent the law allows.',
  },
  {
    title: 'Contact',
    body: `Questions: ${LEGAL.contactEmail}.`,
  },
];
