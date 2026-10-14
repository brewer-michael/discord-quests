"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card stack" style={{ maxWidth: 560 }}>
      <h1>Something went wrong</h1>
      <p className="muted">
        The page couldn't load. If you run this site, check its logs
        {error.digest ? (
          <>
            {" "}
            for <code>{error.digest}</code>
          </>
        ) : null}
        .
      </p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
