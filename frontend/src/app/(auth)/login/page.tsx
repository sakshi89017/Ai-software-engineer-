import { GuestRoute } from "@/components/auth/guest-route";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <GuestRoute>
      <h1 className="mb-6 text-center text-xl font-semibold">Sign in to your account</h1>
      <LoginForm />
    </GuestRoute>
  );
}
