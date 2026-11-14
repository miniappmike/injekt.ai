import { AuthForm } from "../auth-form";
import { signup } from "../actions";

export default function SignupPage() {
  return <AuthForm mode="signup" action={signup} />;
}
