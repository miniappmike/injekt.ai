import { AuthForm } from "../auth-form";
import { login } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; deleted?: string }> }) {
  const { next, deleted } = await searchParams;
  return (
    <>
      {deleted && (
        <p role="status" className="mb-6 rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-sm text-white backdrop-blur-xl">
          Your account has been deleted.
        </p>
      )}
      <AuthForm mode="login" action={login} next={next} />
    </>
  );
}
