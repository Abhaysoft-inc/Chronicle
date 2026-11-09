'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { useToast } from '@/components/ui/toast';
import {
  createApiKey,
  getOrg,
  getUsage,
  listApiKeys,
  listCases,
  purgeCase,
  revokeApiKey,
  updateOrg,
} from '@/lib/api/endpoints';
import type { ApiKeyItem, CaseSummary, OrganizationInfo, UsageAnalytics } from '@/lib/api/types';

export function AdminView() {
  const notify = useToast();
  const [org, setOrg] = useState<OrganizationInfo | null>(null);
  const [usage, setUsage] = useState<UsageAnalytics | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // New API Key Modal / Created display
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);

  // Purge state
  const [selectedCaseToPurge, setSelectedCaseToPurge] = useState('');
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    Promise.all([getOrg(), getUsage(), listApiKeys(), listCases()])
      .then(([orgData, usageData, keys, caseList]) => {
        setOrg(orgData);
        setUsage(usageData);
        setApiKeys(keys);
        setCases(caseList);
        if (caseList.length > 0) setSelectedCaseToPurge(caseList[0].id);
      })
      .catch((err) => notify((err as Error).message, 'bad'))
      .finally(() => setLoading(false));
  }, [notify]);

  async function handlePlanChange(newPlan: 'starter' | 'professional' | 'enterprise') {
    const quotaMap = { starter: 500, professional: 2500, enterprise: 10000 };
    try {
      const updated = await updateOrg({ plan: newPlan, quota_pages: quotaMap[newPlan] });
      setOrg(updated);
      notify(`Organization plan changed to ${newPlan.toUpperCase()}.`, 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    }
  }

  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res = await createApiKey(newKeyName.trim());
      setCreatedKey(res.key);
      setApiKeys((prev) => [res.apiKey, ...prev]);
      setNewKeyName('');
      notify('New API key created. Copy it now.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleRevokeKey(keyId: string) {
    if (!confirm('Revoke this API key? Any integration using it will immediately lose access.')) return;
    try {
      await revokeApiKey(keyId);
      setApiKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, revoked_at: new Date().toISOString() } : k)));
      notify('API key revoked.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    }
  }

  async function handlePurge() {
    if (!selectedCaseToPurge) return;
    if (!confirm('DANGER: This will permanently delete all case files, OCR blocks, extracted events, and findings in accordance with DPDP/GDPR data retention controls. Continue?')) {
      return;
    }
    setPurging(true);
    try {
      await purgeCase(selectedCaseToPurge);
      setCases((prev) => prev.filter((c) => c.id !== selectedCaseToPurge));
      notify(`Case ${selectedCaseToPurge} permanently purged.`, 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto py-2">
      <div className="border-b border-border pb-4">
        <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">SaaS Administration & Enterprise Controls</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Organization plans, quota consumption, secure API access keys, and DPDP / GDPR data retention compliance.
        </p>
      </div>

      {loading ? (
        <Card className="text-center py-16 text-sm text-muted-foreground">Loading administration dashboard...</Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Organization & Subscription Tier */}
          <Card className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs text-muted-foreground">Organization Account</span>
                <h2 className="text-base font-semibold text-foreground">{org?.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone="ok">Current Plan: {org?.plan?.toUpperCase()}</Pill>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  org?.plan === 'starter' ? 'border-accent bg-accent/5' : 'border-border bg-card'
                }`}
                onClick={() => handlePlanChange('starter')}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-sm">Starter</span>
                  <span className="text-xs text-muted-foreground">₹4,999/mo</span>
                </div>
                <p className="text-xs text-muted-foreground">500 pages/mo · 2 Medical-legal cases · Basic AI Extraction</p>
              </div>

              <div
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  org?.plan === 'professional' ? 'border-accent bg-accent/5' : 'border-border bg-card'
                }`}
                onClick={() => handlePlanChange('professional')}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-sm">Professional</span>
                  <span className="text-xs text-accent font-medium">₹14,999/mo</span>
                </div>
                <p className="text-xs text-muted-foreground">2,500 pages/mo · Unlimited cases · Saaras & Bulbul Voice Intelligence</p>
              </div>

              <div
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  org?.plan === 'enterprise' ? 'border-accent bg-accent/5' : 'border-border bg-card'
                }`}
                onClick={() => handlePlanChange('enterprise')}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-sm">Enterprise / Hospital</span>
                  <span className="text-xs text-muted-foreground">Custom</span>
                </div>
                <p className="text-xs text-muted-foreground">10,000+ pages/mo · Dedicated API quotas · Full Hospital Clinical Audit</p>
              </div>
            </div>
          </Card>

          {/* Usage Analytics & Processing Quotas */}
          {usage && (
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Usage Analytics & Monthly Quota</h3>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-foreground">
                  <span>Document Pages Processed ({usage.usage.pages_processed} / {usage.organization.quota_pages})</span>
                  <span className="font-semibold">{usage.usage.quota_percentage}% Used</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-500"
                    style={{ width: `${usage.usage.quota_percentage}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 bg-muted/60 rounded-lg text-xs">
                  <span className="text-muted-foreground">Total Cases</span>
                  <div className="text-lg font-bold text-foreground mt-0.5">{usage.usage.cases_count}</div>
                </div>
                <div className="p-3 bg-muted/60 rounded-lg text-xs">
                  <span className="text-muted-foreground">Documents Ingested</span>
                  <div className="text-lg font-bold text-foreground mt-0.5">{usage.usage.documents_count}</div>
                </div>
                <div className="p-3 bg-muted/60 rounded-lg text-xs">
                  <span className="text-muted-foreground">Audio Transcriptions</span>
                  <div className="text-lg font-bold text-foreground mt-0.5">{usage.usage.audio_recordings_count}</div>
                </div>
                <div className="p-3 bg-muted/60 rounded-lg text-xs">
                  <span className="text-muted-foreground">Pages Remaining</span>
                  <div className="text-lg font-bold text-ok mt-0.5">{usage.usage.quota_remaining}</div>
                </div>
              </div>
            </Card>
          )}

          {/* API Access Keys */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">API Access Keys</h3>
                <p className="text-xs text-muted-foreground">
                  Programmatic API keys for law firm CRM and hospital EHR integrations.
                </p>
              </div>
            </div>

            {/* Created Key Banner */}
            {createdKey && (
              <div className="p-3 bg-ok-bg border border-ok/30 rounded-lg text-xs space-y-1 text-ok">
                <span className="font-bold">New API Key Created:</span>
                <p className="font-mono bg-background p-2 rounded text-foreground break-all">{createdKey}</p>
                <p className="text-[11px] text-muted-foreground">Copy this key now. For security, it cannot be displayed again.</p>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
                placeholder="Key name (e.g. Hospital EHR Sync, Legal Billing Bot)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
              <Button size="sm" onClick={handleCreateKey} disabled={creatingKey || !newKeyName.trim()}>
                {creatingKey ? 'Generating...' : '+ Generate API Key'}
              </Button>
            </div>

            <div className="space-y-2 pt-2">
              {apiKeys.length === 0 ? (
                <p className="text-xs text-muted-foreground">No API keys created yet.</p>
              ) : (
                apiKeys.map((k) => (
                  <div key={k.id} className="p-2.5 rounded border border-border flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-2">
                        {k.name}
                        {k.revoked_at ? <Pill tone="bad">REVOKED</Pill> : <Pill tone="ok">ACTIVE</Pill>}
                      </div>
                      <div className="font-mono text-muted-foreground text-[11px] mt-0.5">{k.prefix}...</div>
                    </div>
                    {!k.revoked_at && (
                      <Button variant="outline" size="sm" onClick={() => handleRevokeKey(k.id)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Data Retention & Privacy Controls */}
          <Card className="p-5 space-y-3 border-bad/30 bg-bad-bg/5">
            <h3 className="text-sm font-semibold text-bad flex items-center gap-2">
              🛡️ Data Retention & Deletion Controls (DPDP & GDPR Compliance)
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              In accordance with Indian Digital Personal Data Protection (DPDP) Act and hospital data retention guidelines, permanently purge case documents, physical chunk files, OCR text, and timeline records.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-2 items-center">
              <select
                className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
                value={selectedCaseToPurge}
                onChange={(e) => setSelectedCaseToPurge(e.target.value)}
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} (ID: {c.id})
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                className="text-bad hover:bg-bad/10"
                onClick={handlePurge}
                disabled={purging || !selectedCaseToPurge}
              >
                {purging ? 'Purging Records...' : 'Permanently Purge Case Data'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
