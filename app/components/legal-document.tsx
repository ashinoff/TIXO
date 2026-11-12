import Link from "next/link";
import { LEGAL_DATE, type LegalDocument, type LegalSettings } from "../../lib/legal";
import "./legal-document.css";

export function LegalDocumentPage({ document, settings, version, current }: { document: LegalDocument; settings: LegalSettings; version: string; current: "privacy" | "consent" }) {
  return <div className="legal-page">
    <header className="legal-header"><Link className="legal-wordmark" href="/" aria-label="ТИХО — на главную">тихо</Link><Link href="/#collection">Вернуться к свечам <span aria-hidden="true">↗</span></Link></header>
    <main id="legal-content">
      <div className="legal-title"><p className="legal-eyebrow">ТИХО / ДОКУМЕНТЫ</p><h1>{document.title}</h1><p className="legal-lead">{document.introduction}</p><p className="legal-edition">Редакция от {LEGAL_DATE}{current === "consent" && <> · Версия <span title={version}>{version.slice(0, 12)}</span></>}</p></div>
      <div className="legal-body"><nav className="legal-index" aria-label="Разделы документа">{document.sections.map((section, i) => <a key={section.title} href={`#section-${i + 1}`}><span>{String(i + 1).padStart(2, "0")}</span>{section.title}</a>)}</nav>
        <article>{document.sections.map((section, i) => <section id={`section-${i + 1}`} key={section.title}><h2><span>{String(i + 1).padStart(2, "0")}</span>{section.title}</h2>{section.paragraphs.map((paragraph, p) => <p key={p}>{paragraph}</p>)}</section>)}</article>
      </div>
      {(settings.contactEmail || settings.contactPhone) && <aside className="legal-contact"><h2>Вопросы о ваших данных</h2><p>Для обращения или отзыва согласия свяжитесь с мастерской.</p><div>{settings.contactEmail && <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>}{settings.contactPhone && <a href={`tel:${settings.contactPhone.replace(/[^+\d]/g, "")}`}>{settings.contactPhone}</a>}</div></aside>}
    </main>
    <footer className="legal-footer"><span>© ТИХО / TiXO</span><nav aria-label="Документы"><a href="/privacy" aria-current={current === "privacy" ? "page" : undefined}>Политика обработки данных</a><a href="/consent" aria-current={current === "consent" ? "page" : undefined}>Согласие на обработку данных</a></nav></footer>
  </div>;
}
