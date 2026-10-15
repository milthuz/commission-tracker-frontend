import React from 'react';

// Page header of the partner portal — same title block as the redesigned internal screens
// (Leads, Opener…): partner name as the small line above, 24 px title, optional subtitle and
// actions on the right (they wrap under the title on a phone).
const PartnerPageHeader = ({ eyebrow, title, subtitle, actions }: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) => (
  <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div className="flex min-w-0 flex-col gap-0.5">
      {eyebrow && <span className="truncate text-[13px] text-body dark:text-bodydark2">{eyebrow}</span>}
      <h1 className="m-0 text-2xl font-bold leading-tight tracking-[-0.01em] text-black dark:text-white">{title}</h1>
      {subtitle && <p className="m-0 text-[13px] text-body dark:text-bodydark2">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </header>
);

export default PartnerPageHeader;
