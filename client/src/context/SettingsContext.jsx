import { createContext, useContext, useState, useEffect } from 'react'
import { settingsService } from '../services/settings'

const DEFAULT_SETTINGS = {
  store_name: 'GhanaShop POS',
  store_address: '14 Liberation Road, Accra, Ghana',
  store_phone: '030-200-0000',
  tax_rate: '0',
  loyalty_points_rate: '10',
  currency_symbol: 'GH₵',
  receipt_footer: 'Thank you for your business!',
}

export const SettingsContext = createContext(DEFAULT_SETTINGS)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  useEffect(() => {
    settingsService
      .get()
      .then((res) => {
        const data = res.data?.data
        if (data) setSettings((prev) => ({ ...prev, ...data }))
      })
      .catch(() => {
        // Fall back to defaults silently
      })
  }, [])

  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}
