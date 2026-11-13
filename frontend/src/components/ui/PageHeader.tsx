import type { ReactNode } from 'react';

// Page title block: the dim terminal prompt, the title, an optional lead
// paragraph and tools on the right (filters, buttons).
interface Props {
  prompt: string;               // e.g. "ls -lt ~/blog"
  promptChar?: '$' | '#';       // "#" for root-only pages
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;         // tools
}

export default function PageHeader({ prompt, promptChar = '$', title, lead, children }: Props) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow"><span className="p">{promptChar}</span> <span className="c">{prompt}</span></div>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {children && <div className="tools">{children}</div>}
    </div>
  );
}
