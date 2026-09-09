export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  isLoading = false,
  disabled,
  className = '',
  ...rest
}) {
  const base = variant === 'secondary' ? 'btn-secondary' : 'btn-primary';
  return (
    <button type={type} className={`${base} ${className}`} disabled={disabled || isLoading} {...rest}>
      {isLoading ? 'Please wait...' : children}
    </button>
  );
}