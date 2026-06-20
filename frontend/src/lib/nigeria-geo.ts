import type { LatLngExpression } from "leaflet";

export const DISCO_COLORS: Record<string, string> = {
  AEDC: "#1565C0",
  KEDCO: "#7B1FA2",
  IE: "#E65100",
};

export const DISCO_FILL: Record<string, string> = {
  AEDC: "rgba(21,101,192,0.08)",
  KEDCO: "rgba(123,31,162,0.08)",
  IE: "rgba(230,81,0,0.08)",
};

export const DISCO_CENTERS: Record<string, LatLngExpression> = {
  AEDC: [9.06, 7.49],
  KEDCO: [11.5, 8.5],
  IE: [6.5, 3.4],
};

export const DISCO_CONCESSIONS: Record<string, LatLngExpression[]> = {
  AEDC: [
    [11.5, 3.4],
    [11.5, 9.7],
    [9.0, 9.7],
    [6.3, 9.7],
    [6.3, 5.8],
    [7.5, 3.4],
  ],
  KEDCO: [
    [13.5, 6.7],
    [13.5, 10.8],
    [10.4, 10.8],
    [10.4, 6.7],
  ],
  IE: [
    [6.8, 2.6],
    [6.8, 4.5],
    [6.3, 4.5],
    [6.3, 2.6],
  ],
};

export const TRANSMISSION_LINES: {
  name: string;
  voltage: string;
  coords: LatLngExpression[];
}[] = [
  {
    name: "330kV Shiroro–Kaduna",
    voltage: "330kV",
    coords: [
      [9.97, 6.84],
      [10.52, 7.44],
    ],
  },
  {
    name: "330kV Kaduna–Kano",
    voltage: "330kV",
    coords: [
      [10.52, 7.44],
      [11.15, 7.65],
      [11.99, 8.52],
    ],
  },
  {
    name: "330kV Shiroro–Jebba",
    voltage: "330kV",
    coords: [
      [9.97, 6.84],
      [9.12, 4.81],
    ],
  },
  {
    name: "330kV Jebba–Oshogbo",
    voltage: "330kV",
    coords: [
      [9.12, 4.81],
      [7.78, 4.57],
    ],
  },
  {
    name: "330kV Oshogbo–Ikeja West",
    voltage: "330kV",
    coords: [
      [7.78, 4.57],
      [6.6, 3.35],
    ],
  },
  {
    name: "132kV Kano–Katsina",
    voltage: "132kV",
    coords: [
      [11.99, 8.52],
      [12.99, 7.6],
    ],
  },
  {
    name: "132kV Kano–Dutse",
    voltage: "132kV",
    coords: [
      [11.99, 8.52],
      [11.76, 9.34],
    ],
  },
  {
    name: "330kV Lokoja–Ajaokuta",
    voltage: "330kV",
    coords: [
      [7.8, 6.74],
      [7.56, 6.57],
    ],
  },
  {
    name: "132kV Lafia–Makurdi",
    voltage: "132kV",
    coords: [
      [8.49, 8.52],
      [7.73, 8.54],
    ],
  },
  {
    name: "330kV Abuja–Shiroro",
    voltage: "330kV",
    coords: [
      [9.06, 7.49],
      [9.97, 6.84],
    ],
  },
  {
    name: "132kV Abuja–Lafia",
    voltage: "132kV",
    coords: [
      [9.06, 7.49],
      [8.49, 8.52],
    ],
  },
  {
    name: "132kV Abuja–Lokoja",
    voltage: "132kV",
    coords: [
      [9.06, 7.49],
      [7.8, 6.74],
    ],
  },
];
