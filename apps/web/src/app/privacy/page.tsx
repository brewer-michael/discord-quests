export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <article className="card stack" style={{ maxWidth: 760 }}>
      <h1>Privacy</h1>
      <p>
        <strong>On Discord,</strong> the bot stores Discord user and server IDs, the heroes players make, and
        the story so far. It never asks for real names, ages, emails or locations, and it can't read ordinary
        chat messages. Anything a player types for their hero is checked for safety; blocked text is never
        stored, only a note that something was blocked.
      </p>
      <p>
        <strong>On this site,</strong> signing in stores your Discord ID, display name, avatar, the list of
        servers you can manage, and an encrypted Discord sign-in token used to refresh that list. Sessions end
        after a week or when you sign out.
      </p>
      <p>
        <strong>API keys</strong> you enter are encrypted before they're saved and are never shown again, only
        their last four characters. Story text and scene descriptions are sent to the AI services this server
        chooses, under those services' own terms.
      </p>
      <p>
        <strong>Deleting:</strong> a campaign can be permanently deleted with <code>/campaign delete</code> or
        on the Campaigns page here. That removes its whole history.
      </p>
    </article>
  );
}
