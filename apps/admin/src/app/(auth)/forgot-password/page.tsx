import { AuthCard, ForgotPasswordForm } from '@dax/web-shell';
import { PRODUCT } from '../../../lib/server';

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      product={PRODUCT}
      title="Forgot your password?"
      description="Enter the email on your account and we'll send you a link to choose a new password."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
