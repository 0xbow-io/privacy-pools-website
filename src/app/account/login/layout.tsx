export default function LoginLayout({ children }: { children: React.ReactNode }) {
  // Allow access to login page regardless of authentication state
  return children;
}
