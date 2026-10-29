// 071-network-block: the one statement that points DuckDB at the deployer's extension files (`network.duckdb_extensions`). Pure. Only an http or
// https address is accepted, and the text is quoted (a single quote doubled) so no address can end the string early. It is run by the app's own
// startup code through the shared connection, never from user SQL, which sqlGuard still refuses (SET, INSTALL, LOAD).
import { isWebAddress } from '@/config'

export function extensionRepositoryStatement(address: string | undefined): string | undefined {
  if (!address || !isWebAddress(address)) return undefined
  return `SET custom_extension_repository = '${address.trim().replace(/'/g, "''")}'`
}
