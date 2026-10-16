import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; resetKey: string };
type State = { error: Error | null };

/**
 * Catches render errors of a single page so the rest of the app (navigation, layout) keeps working.
 * Without it, one broken page unmounts the whole app and leaves an empty screen.
 * The error is cleared when the user navigates to another page.
 */
class Boundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[PageErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    return this.state.error ? <PageError /> : this.props.children;
  }
}

function PageError() {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
      <h1 className="font-display text-2xl font-semibold text-foreground">{t("page_error.title", "This page could not be shown")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("page_error.hint", "Something went wrong while displaying it. Reloading usually helps.")}
      </p>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => window.location.reload()}>{t("page_error.reload", "Reload")}</Button>
        <Button variant="ghost" onClick={() => (window.location.href = "/")}>
          {t("not_found.home", "Go to feed")}
        </Button>
      </div>
    </div>
  );
}

export function PageErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <Boundary resetKey={location}>{children}</Boundary>;
}
