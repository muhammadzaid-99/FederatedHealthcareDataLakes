"use client"

import * as React from "react"
import { type DateRange } from "react-day-picker"

import { Calendar } from "@/components/ui/calendar"

interface DateRangePickerProps {
  value?: DateRange
  onChange?: (range: DateRange | undefined) => void
  className?: string
}

export function DateRangePicker({
  value,
  onChange,
  className,
}: DateRangePickerProps) {
  return (
    <Calendar
      mode="range"
      defaultMonth={value?.from}
      selected={value}
      onSelect={onChange}
      numberOfMonths={2}
      className={className || "rounded-lg border shadow-sm"}
    />
  )
}
