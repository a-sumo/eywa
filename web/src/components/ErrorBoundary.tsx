import { Component, type ReactNode, type ErrorInfo } from "react";
import i18next from "i18next";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>{i18next.t("boundary.title", { ns: "errors" })}</h2>
            <p>{i18next.t("boundary.description", { ns: "errors" })}</p>
            <details>
              <summary>{i18next.t("boundary.details", { ns: "errors" })}</summary>
              <pre>{this.state.error?.message}</pre>
            </details>
            <button
              className="error-boundary-btn"
              onClick={() => window.location.reload()}
            >
              {i18next.t("boundary.refresh", { ns: "errors" })}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
