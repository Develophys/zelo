import { Button } from "@/presentation/ui/Button";

interface DataTableErrorProps {
  message: string;
  onRetry(): void;
}

export function DataTableError({ message, onRetry }: DataTableErrorProps) {
  return (
    <div className="px-cell-x py-10 text-center">
      <p role="alert" className="text-label text-danger">
        {message}
      </p>
      <Button variant="outline" size="sm" full={false} className="mt-3" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
