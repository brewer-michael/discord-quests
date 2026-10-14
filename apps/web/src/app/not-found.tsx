import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card stack" style={{ maxWidth: 560 }}>
      <h1>Not found</h1>
      <p className="muted">
        This page doesn't exist, or you don't have permission to manage that server. You need the Manage
        Server permission on Discord to set the bot up.
      </p>
      <div className="row">
        <Link className="btn btn-primary" href="/servers">
          Your servers
        </Link>
      </div>
    </div>
  );
}
