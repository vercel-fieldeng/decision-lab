"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main style={{ maxWidth: 600, margin: "120px auto", padding: 24 }}>
      <h1 style={{ fontSize: 32 }}>The playground hit a snag.</h1>
      <p
        style={{ margin: "20px 0", color: "var(--secondary)", lineHeight: 1.6 }}
      >
        Your Gateway credentials stay on the server. Reload the workspace to try
        again.
      </p>
      <button className="primary-button" onClick={reset}>
        Reload playground
      </button>
    </main>
  );
}
