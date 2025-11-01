interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
}

export default function PageContainer({
  children,
  title,
  description,
  className = '',
}: PageContainerProps) {
  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 ${className}`}>
      {title && (
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{title}</h1>
          {description && (
            <p className="text-lg text-gray-600">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
