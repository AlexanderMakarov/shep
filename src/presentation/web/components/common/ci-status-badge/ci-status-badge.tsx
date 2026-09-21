import { CheckCircle2, HelpCircle, Loader2, XCircle } from 'lucide-react';
import { CiStatus } from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';

export function CiStatusBadge({ status }: { status: CiStatus }) {
  switch (status) {
    case CiStatus.Success:
      return (
        <Badge className="border-transparent bg-green-50 text-green-700 hover:bg-green-50">
          <CheckCircle2 className="me-1 h-3.5 w-3.5" />
          Passing
        </Badge>
      );
    case CiStatus.Pending:
      return (
        <Badge className="border-transparent bg-yellow-50 text-yellow-700 hover:bg-yellow-50">
          <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
          Pending
        </Badge>
      );
    case CiStatus.Failure:
      return (
        <Badge className="border-transparent bg-red-50 text-red-700 hover:bg-red-50">
          <XCircle className="me-1 h-3.5 w-3.5" />
          Failing
        </Badge>
      );
    // CI could not be read (rate limit, API error, no run observed). Shown as
    // its own state so it is never mistaken for a pass.
    case CiStatus.Indeterminate:
      return (
        <Badge className="border-transparent bg-amber-50 text-amber-700 hover:bg-amber-50">
          <HelpCircle className="me-1 h-3.5 w-3.5" />
          Unknown
        </Badge>
      );
    default: {
      // Exhaustiveness guard: a new CiStatus member breaks the build here
      // until it is given an explicit badge.
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
