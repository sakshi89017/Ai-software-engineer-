"use client";

import * as React from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuestRoute } from "@/components/auth/guest-route";
import { apiClient, extractApiErrorMessage } from "@/lib/api-client";

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setIsSubmitting(true);
    try {
      await apiClient.post("/api/auth/forgot-password", values);
      setIsSuccess(true);
      toast.success("Reset request submitted successfully!");
    } catch (err) {
      toast.error(extractApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GuestRoute>
      <div className="space-y-4">
        <h1 className="mb-2 text-center text-xl font-semibold">Forgot your password?</h1>
        
        {isSuccess ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg bg-primary/10 border border-primary/20 p-5 text-center space-y-3"
          >
            <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              If that email matches an account, we have printed a temporary reset link to the server console log.
            </p>
            <p className="text-[10px] text-primary/80 font-mono bg-background/50 p-2 rounded border border-border/40 select-all">
              Please check your backend terminal for the link!
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-1.5 text-xs text-primary hover:underline font-semibold"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to login
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
            <p className="text-xs text-muted-foreground text-center">
              Enter your email address and we will generate a link to reset your password.
            </p>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  {...register("email")}
                  className="pl-3"
                />
              </div>
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full text-xs gap-1.5" isLoading={isSubmitting}>
              <Mail className="h-3.5 w-3.5" /> Request Reset Link
            </Button>

            <p className="text-center text-xs">
              <Link href="/login" className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to login
              </Link>
            </p>
          </motion.form>
        )}
      </div>
    </GuestRoute>
  );
}
