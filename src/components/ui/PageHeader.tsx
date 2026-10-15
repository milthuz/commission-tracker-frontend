import React from 'react';

// Page header of the redesign (refonte UI, P3) — the pattern the commission report introduced:
// the menu section in small type, the title, a one-line subtitle, actions on the right (they
// wrap under the title on a phone).
const PageHeader = ({ section, title, subtitle, actions }: {
  section?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      {section && <span className="text-[13px] text-body dark:text-bodydark2">{section}</span>}
      <h1 className="m-0 text-2xl font-bold leading-tight tracking-[-0.01em] text-black dark:text-white">{title}</h1>
      {subtitle && <p className="m-0 mt-1 text-[13px] text-body dark:text-bodydark2">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export default PageHeader;
