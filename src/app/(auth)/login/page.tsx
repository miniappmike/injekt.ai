import { AuthForm } from "../auth-form";
import { login } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; deleted?: string }> }) {
  const { next, deleted } = await searchParams;
  return (
    <>
      {deleted && (
        <p role="status" className="mx-auto mb-4 max-w-sm rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-200">
          Your account has been deleted.
        </p>
      )}
      <AuthForm mode="login" action={login} next={next} />
    </>
  );
}
