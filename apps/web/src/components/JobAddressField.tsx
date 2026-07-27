'use client'

import { useState } from 'react'
import AddressAutocomplete from './AddressAutocomplete'

export default function JobAddressField({
  defaultValue,
  defaultLat,
  defaultLng,
  customerAddress,
}: {
  defaultValue: string
  defaultLat: number | null
  defaultLng: number | null
  customerAddress: string | null
}) {
  const [sameAsCustomer, setSameAsCustomer] = useState(false)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [jobGeo, setJobGeo] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  })

  const mapsHref =
    jobGeo.lat && jobGeo.lng
      ? `https://www.google.com/maps/search/?api=1&query=${jobGeo.lat},${jobGeo.lng}`
      : defaultLat && defaultLng
        ? `https://www.google.com/maps/search/?api=1&query=${defaultLat},${defaultLng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(defaultValue)}`

  async function toggleSameAsCustomer(checked: boolean) {
    setSameAsCustomer(checked)
    if (!checked || !customerAddress?.trim()) return

    setIsGeocoding(true)
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(customerAddress)}`)
    if (res.ok) {
      const data = await res.json()
      setJobGeo({ lat: data.lat, lng: data.lng })
    } else {
      setJobGeo({ lat: null, lng: null })
    }
    setIsGeocoding(false)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label htmlFor="address_line" className="text-sm font-medium">
          Job address
        </label>
        {(defaultValue || (defaultLat && defaultLng)) && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent hover:opacity-80"
          >
            Open in Google Maps
          </a>
        )}
      </div>

      {customerAddress?.trim() && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={sameAsCustomer}
            onChange={(e) => toggleSameAsCustomer(e.target.checked)}
          />
          Same as customer address
        </label>
      )}

      {sameAsCustomer ? (
        <>
          <input
            type="text"
            readOnly
            value={isGeocoding ? 'Locating…' : (customerAddress ?? '')}
            className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-muted"
          />
          <input type="hidden" name="address_line" value={customerAddress ?? ''} />
          <input type="hidden" name="geo_lat" value={jobGeo.lat ?? ''} />
          <input type="hidden" name="geo_lng" value={jobGeo.lng ?? ''} />
        </>
      ) : (
        <AddressAutocomplete
          id="address_line"
          name="address_line"
          geoLatName="geo_lat"
          geoLngName="geo_lng"
          defaultValue={defaultValue}
          defaultLat={defaultLat}
          defaultLng={defaultLng}
        />
      )}
    </div>
  )
}
