import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { plansApi, type SubscriptionPlan } from '@/features/premium/api/plansApi';
import { defaultPlanCode } from '@/features/premium/plans';

const PLANS_STALE_MS = 30 * 60 * 1000;

/** The plans on sale. They rarely change, so one fetch serves every screen for half an hour. */
export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ['subscription-plans'],
    queryFn: plansApi.listActive,
    staleTime: PLANS_STALE_MS,
  });
}

/**
 * The plan picked in a plan list. Starts on `requested`, else the popular plan, else the first
 * (see defaultPlanCode), once the plans have loaded -- so "Next" works without a tap.
 */
export function useSelectedPlan(plans: SubscriptionPlan[] | undefined, requested?: string) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCode || !plans?.length) return;
    setSelectedCode(defaultPlanCode(plans, requested));
  }, [plans, selectedCode, requested]);

  const selectedPlan = plans?.find(plan => plan.code === selectedCode);
  return { selectedCode, selectedPlan, select: setSelectedCode };
}
