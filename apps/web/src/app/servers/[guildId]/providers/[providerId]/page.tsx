import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ProviderForm } from "@/components/ProviderForm";
import { TestButton } from "@/components/TestButton";
import { requireGuild } from "@/server/access";
import { services } from "@/server/db";
import { presetOptions, providerFormValues } from "@/server/providers";
import {
  deleteProviderAction,
  listModelsAction,
  saveProviderAction,
  testProviderAction,
} from "../../actions";

export const metadata = { title: "Edit a service" };
export const dynamic = "force-dynamic";

export default async function EditProvider({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; providerId: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const { guildId, providerId } = await params;
  const added = (await searchParams).added === "1";
  await requireGuild(guildId);
  const values = await providerFormValues(services().handle.db, guildId, providerId);
  if (!values) notFound();
  return (
    <>
      <div className="card">
        <p className="small">
          <Link href={`/servers/${guildId}`}>← Overview</Link>
        </p>
        <div className="card-head">
          <h2>{values.name}</h2>
          {values.enabled ? <span className="badge badge-ok">On</span> : <span className="badge">Off</span>}
        </div>
        {added ? (
          <div className="callout callout-ok" style={{ marginBottom: 16 }}>
            Added. Test the connection to make sure everything works.
          </div>
        ) : null}
        <div style={{ marginBottom: 20 }}>
          <TestButton test={testProviderAction.bind(null, guildId, providerId)} kind={values.kind} />
        </div>
        <ProviderForm
          kind={values.kind}
          presets={presetOptions()}
          initial={values}
          save={saveProviderAction.bind(null, guildId, providerId)}
          loadModels={values.kind === "llm" ? listModelsAction.bind(null, guildId, providerId) : undefined}
        />
      </div>
      <div className="card">
        <h3>Remove this service</h3>
        <p className="muted small">
          Its saved key is deleted, and any job that used it falls back to the next choice.
        </p>
        <ActionForm
          action={deleteProviderAction.bind(null, guildId, providerId)}
          confirm={`Remove “${values.name}”? This can't be undone.`}
        >
          <div>
            <SubmitButton className="btn btn-danger" pendingText="Removing…">
              Remove
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
    </>
  );
}
