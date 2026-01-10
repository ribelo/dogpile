import { createResource, Show, For } from "solid-js"
import DollarSign from "lucide-solid/icons/dollar-sign"
import Coins from "lucide-solid/icons/coins"
import Activity from "lucide-solid/icons/activity"
import BarChart3 from "lucide-solid/icons/bar-chart-3"

interface CostSummary {
  costUsd: number
  calls: number
  tokens: number
}

interface CostBreakdown {
  operation: string
  costUsd: number
  calls: number
  tokens: number
}

interface CostsResponse {
  total: CostSummary
  breakdown: CostBreakdown[]
}

interface Props {
  apiUrl: string
  adminKey: string
}

async function fetchCosts(apiUrl: string, adminKey: string): Promise<CostsResponse> {
  const response = await fetch(`${apiUrl}/admin/costs?groupBy=operation`, {
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to fetch costs")
  return response.json()
}

export default function CostStats(props: Props) {
  const [costs] = createResource(() => fetchCosts(props.apiUrl, props.adminKey))

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount)

  const formatNumber = (num: number) => 
    new Intl.NumberFormat('en-US').format(num)

  return (
    <div class="mt-8">
      <div class="flex items-center gap-2 mb-6">
        <BarChart3 size={24} class="text-gray-700" />
        <h2 class="text-xl font-bold text-gray-800">AI Operations Costs (Last 30 Days)</h2>
      </div>

      <Show when={costs.loading}>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-pulse">
          <div class="h-32 bg-gray-200 rounded-lg"></div>
          <div class="h-32 bg-gray-200 rounded-lg"></div>
          <div class="h-32 bg-gray-200 rounded-lg"></div>
        </div>
      </Show>

      <Show when={costs.error}>
        <div class="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-8">
          Failed to load cost data. Ensure the API is reachable and authorized.
        </div>
      </Show>

      <Show when={costs()}>
        {(data) => (
          <>
            {/* Summary Cards */}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div class="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-sm font-medium text-gray-500 uppercase">Total Cost</h3>
                  <DollarSign size={20} class="text-green-500" />
                </div>
                <p class="text-3xl font-bold text-gray-900">{formatCurrency(data().total.costUsd)}</p>
                <p class="text-xs text-gray-500 mt-1">Average {formatCurrency(data().total.costUsd / 30)} / day</p>
              </div>

              <div class="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-sm font-medium text-gray-500 uppercase">Total Calls</h3>
                  <Activity size={20} class="text-blue-500" />
                </div>
                <p class="text-3xl font-bold text-gray-900">{formatNumber(data().total.calls)}</p>
                <p class="text-xs text-gray-500 mt-1">AI requests processed</p>
              </div>

              <div class="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-sm font-medium text-gray-500 uppercase">Total Tokens</h3>
                  <Coins size={20} class="text-purple-500" />
                </div>
                <p class="text-3xl font-bold text-gray-900">{formatNumber(data().total.tokens)}</p>
                <p class="text-xs text-gray-500 mt-1">Input + Output</p>
              </div>
            </div>

            {/* Breakdown Table */}
            <div class="bg-white rounded-lg shadow overflow-hidden">
              <div class="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h3 class="font-semibold text-gray-700">Cost Breakdown by Operation</h3>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left">
                  <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-medium">
                    <tr>
                      <th class="px-6 py-3">Operation</th>
                      <th class="px-6 py-3">Calls</th>
                      <th class="px-6 py-3">Tokens</th>
                      <th class="px-6 py-3 text-right">Cost (USD)</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                    <For each={data().breakdown.sort((a, b) => b.costUsd - a.costUsd)}>
                      {(item) => (
                        <tr class="hover:bg-gray-50 transition-colors">
                          <td class="px-6 py-4 font-medium text-gray-900 capitalize">
                            {item.operation.replace(/_/g, ' ')}
                          </td>
                          <td class="px-6 py-4 text-gray-600">{formatNumber(item.calls)}</td>
                          <td class="px-6 py-4 text-gray-600">{formatNumber(item.tokens)}</td>
                          <td class="px-6 py-4 text-right font-semibold text-gray-900">
                            {formatCurrency(item.costUsd)}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
