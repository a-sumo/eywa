import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function QuickstartDocs() {
  const { t } = useTranslation("docs");
  return (
    <article className="docs-article">
      <h1>{t("quickstart.title")}</h1>
      <p className="docs-lead">{t("quickstart.lead")}</p>

      <h2>{t("quickstart.createRoom")}</h2>
      <p>{t("quickstart.createRoomDesc")}</p>
      <pre className="docs-code"><code>npx eywa-ai init</code></pre>
      <p>{t("quickstart.thisWill")}</p>
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t("quickstart.willCreateRoom") }} />
        <li>{t("quickstart.willAutoDetect")}</li>
        <li>{t("quickstart.willConfigure")}</li>
        <li>{t("quickstart.willOpenDashboard")}</li>
      </ul>
      <p>{t("quickstart.usernameNote")}</p>

      <h2>{t("quickstart.joinRoom")}</h2>
      <p>{t("quickstart.joinRoomDesc")}</p>
      <pre className="docs-code"><code>npx eywa-ai join cosmic-fox-a1b2</code></pre>
      <p>{t("quickstart.joinRoomNote")}</p>

      <h2>{t("quickstart.manualSetup")}</h2>
      <p>{t("quickstart.manualSetupDesc")}</p>
      <pre className="docs-code"><code>{`https://mcp.eywa-ai.dev/mcp?room=<room-slug>&agent=<agent>/<your-name>`}</code></pre>
      <p>
        {t("quickstart.manualSetupSeeText1")}
        <Link to="/docs/integrations/claude-code">{t("quickstart.manualSetupIntegrationLink")}</Link>
        {t("quickstart.manualSetupSeeText2")}
      </p>

      <h2>{t("quickstart.whatsNext")}</h2>
      <p>
        {t("quickstart.whatsNextText1")}
        <Link to="/docs">{t("quickstart.whatsNextDocsLink")}</Link>
        {t("quickstart.whatsNextText2")}
        <Link to="/docs/cli">{t("quickstart.whatsNextCLILink")}</Link>
        {t("quickstart.whatsNextText3")}
      </p>
    </article>
  );
}
