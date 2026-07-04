"use client";

import * as React from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import { updateProfileSchema, type UpdateProfileFormValues } from "@/lib/validations/auth";

export function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { full_name: user?.full_name ?? "" },
  });

  const onSubmit = async (values: UpdateProfileFormValues) => {
    setIsSubmitting(true);
    try {
      await updateProfile(values);
      // Re-baseline the form so the Save button disables again until the
      // next edit, without re-fetching the user from the server.
      reset(values);
    } catch {
      // Error toast is already shown by the auth context.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" placeholder="Ada Lovelace" {...register("full_name")} />
        {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={user?.email ?? ""} disabled />
        <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
      </div>

      <Button type="submit" isLoading={isSubmitting} disabled={!isDirty || isSubmitting}>
        Save changes
      </Button>
    </form>
  );
}
