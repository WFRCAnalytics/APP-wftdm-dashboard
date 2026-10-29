// 071-network-block: the allow-list problems the app can know once the raster provider file has loaded (a pattern that names a raster provider can
// only be judged against it). The same messages `check` gives; reported once, at boot, in the configuration note. A default basemap that is not
// allowed is reported where it is used (basemapPolicy), once per level. If the provider file cannot be read nothing is reported: the ids are
// not all known, and a wrong "matches nothing" would mislead.
import { checkAllowList } from '@/config'
import { catalogueIds } from '@/panels/basemap/catalogue'
import { loadProvidersCatalog } from '@/panels/basemap/registry'
import { getBasemapAllowList } from '@/services/networkPolicy'
import { addProblems } from '@/state/configProblems'

export async function reportAllowListProblems(): Promise<void> {
  const allow = getBasemapAllowList()
  if (allow.length === 0) return
  let ids: string[]
  try {
    ids = catalogueIds(await loadProvidersCatalog())
  } catch {
    return
  }
  const messages = checkAllowList(allow, ids)
  if (messages.length === 0) return
  addProblems(messages.map((message) => ({ file: 'dashboard-config.yaml', path: 'network.basemaps.allow', kind: 'invalid_value' as const, message })))
}
