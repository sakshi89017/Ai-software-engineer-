import { GuestRoute } from "@/components/auth/guest-route";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <GuestRoute>
      <h1 className="mb-6 text-center text-xl font-semibold">Create your account</h1>
      <RegisterForm />
    </GuestRoute>
  );
}
