# Every component and token comes from Perron

Mylder's interface is built only from Perron (`@mylder/perron`), the design system made for it: its components, patterns and tokens, including the map's colours and the vehicle glyphs. A component Mylder needs that Perron lacks is built in Perron, through its component factory, rather than hand-rolled in the app. We chose this so the app and the design system stay one visual language, and so Perron is proven on a real product; the cost is that a missing component can block a screen until Perron ships it.
