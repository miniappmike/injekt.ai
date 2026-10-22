// Landing page for ApiKeyRequiredError redirects. The key manager UI is built later.
export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const { provider } = await searchParams;
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">API keys</h1>
      {provider && (
        <p className="mt-2 text-amber-400">Add a {provider} key to continue.</p>
      )}
    </main>
  );
}
