import type { ReactNode } from 'react';

export function AuthCard({
  product,
  title,
  description,
  children,
}: {
  product: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="dax-auth">
      <div className="dax-brand">
        <b>dax</b>
        <small>engineering</small>
      </div>
      <section className="dax-auth-card">
        <div className="dax-eyebrow">{product}</div>
        <h1>{title}</h1>
        {description ? <p className="dax-lede">{description}</p> : null}
        <div className="dax-auth-body">{children}</div>
      </section>
    </main>
  );
}
