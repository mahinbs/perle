import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * App-level error boundary. A render-time crash anywhere in the tree
 * previously left the user staring at a blank white screen with no
 * indication of what failed. This catches the error, logs it, and
 * shows a recoverable error UI with a "Try again" button that re-
 * mounts the subtree.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface to the dev console + browser network/extension consoles so
    // we can grep for crash patterns. Stays a no-op in production logs
    // since console.error is the standard channel React expects.
    console.error("[ErrorBoundary] React render crash:", error, info);
  }

  handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "var(--bg, #fff)",
          color: "var(--text, #111)",
        }}
      >
        <div
          style={{
            maxWidth: 460,
            width: "100%",
            background: "var(--card, #fff)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 16,
            padding: "28px 24px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            Something went wrong.
          </h1>
          <p
            style={{
              marginTop: 8,
              marginBottom: 20,
              color: "var(--sub, #6b7280)",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            The screen hit an unexpected error and was prevented from
            crashing. You can try again or reload the page.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background: "var(--accent, #6366F1)",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid var(--border, #e5e7eb)",
                background: "transparent",
                color: "var(--text, #111)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload page
            </button>
          </div>
          {import.meta.env.DEV && (
            <pre
              style={{
                marginTop: 18,
                padding: 12,
                background: "var(--input-bg, #f3f4f6)",
                borderRadius: 8,
                fontSize: 11,
                textAlign: "left",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {this.state.error?.message}
              {"\n"}
              {this.state.error?.stack}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
