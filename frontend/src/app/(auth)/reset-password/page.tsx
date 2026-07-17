"use client";

import * as React from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { KeyRound, ArrowLeft, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuestRoute } from "@/components/auth/guest-route";
import { apiClient, extractApiErrorMessage } from "@/lib/api-client";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, { message: "Password must be at least 8 characters." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (values: ResetPasswordValues) => {
    if (!token) {
      toast.error("Verification token is missing. Please check your reset link.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post("/api/auth/reset-password", {
        token: token,
        new_password: values.password,
      });
      setIsSuccess(true);
      toast.success("Password reset successfully!");
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (err) {
      toast.error(extractApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GuestRoute>
      <div className="space-y-4">
        <h1 className="mb-2 text-center text-xl font-semibold">Reset your password</h1>

        {!token ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-center text-xs text-destructive">
            Invalid reset link. Verification token is missing from the URL.
          </div>
        ) : isSuccess ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg bg-primary/10 border border-primary/20 p-5 text-center space-y-3"
          >
            <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
            <p className="text-xs text-muted-foreground">
              Your password has been successfully reset. Redirecting you to login...
            </p>
            <Link href="/login" className="text-xs text-primary font-semibold hover:underline">
              Go to Login now
            </Link>
          </motion.div>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full text-xs gap-1.5" isLoading={isSubmitting}>
              <KeyRound className="h-3.5 w-3.5" /> Save New Password
            </Button>

            <p className="text-center text-xs">
              <Link href="/login" className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary">
                <ArrowLeft className="h-3.5 w-3.5" /> Cancel and return to login
              </Link>
            </p>
          </motion.form>
        )}
      </div>
    </GuestRoute>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={
      <div className="flex justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    }>
      <ResetPasswordContent />
    </React.Suspense>
  );
}
