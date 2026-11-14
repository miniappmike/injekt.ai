import { AuthForm } from "../auth-form";
import { signup } from "../actions";

export const metadata = { title: "Sign Up" };

export default function SignupPage() {
  return <AuthForm mode="signup" action={signup} />;
}
