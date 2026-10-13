// src/components/EmptyState.jsx
// Consistent empty state for every list screen.

export default function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="empty">
      {Icon && (
        <span className="empty-icon">
          <Icon size={28} aria-hidden="true" />
        </span>
      )}
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
      {action}
    </div>
  );
}
