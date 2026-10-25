# A computed position is never Live

Rejseplanen's `journeyPos` gives positions without a time and without saying whether the vehicle reported them or Rejseplanen computed them; only the request's mode tells, and `CALC_REPORT` mixes the two in one answer. Mylder calls Live and Ageing only what came from a `REPORT_ONLY` answer, and treats every position from a `CALC_REPORT` answer, and `journeyDetail`'s last position, as computed, so Estimated. If `REPORT_ONLY` turns out to return little, the map has few or no Live dots and its legend says so, rather than showing Rejseplanen's estimates as the vehicle's word. The honest map is the product; a fuller-looking one that lies about freshness would undo it.

## Considered options

- Treat every position in the one call Mylder can afford as Live, as Rejseplanen's own map in effect does. Rejected: it would make "Live" mean "Rejseplanen has an opinion".
- Guess reported from computed by comparing the position with the timetable. Rejected: a guess about a guess, and the guidelines ask not to show data so it can be misread.
