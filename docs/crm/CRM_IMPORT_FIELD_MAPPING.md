# ZONO — CRM Import Field Mapping

Per entity, the target ZONO fields and their validation type (drives `import/validation.ts` FieldSpec). Source columns are mapped to these; mappings are saveable (`import_mappings`).

## Person / contact
full_name(text, required) · first_name(text) · last_name(text) · phone(phone, required) · email(email) · israeli_id(text) · language(text) · source(text) · campaign(text) · assigned_agent(text→resolve in-org) · tags(tags) · consent_marketing(boolean) · notes(text)

## Buyer (person + buyer profile)
+ budget_min(currency) · budget_max(currency) · rooms_min(number) · rooms_max(number) · size_min_sqm(number) · size_max_sqm(number) · preferred_areas(tags/city) · property_types(tags) · must_parking(boolean) · must_elevator(boolean) · must_safe_room(boolean) · purpose(text) · urgency(text)

## Seller (person + seller profile)
+ desired_price(currency) · minimum_price(currency) · motivation(text) · target_sale_date(date) · allows_exclusive(boolean)

## Property
address(text) · city(city, required) · neighborhood(text) · street(text) · rooms(number) · built_sqm(number, required) · floor(number) · asking_price(currency) · listing_kind(text sale/rent) · has_parking/elevator/safe_room(boolean) · condition(text) · marketing_description(text)

## Task
title(text, required) · due_date(date) · priority(text) · assignee(text→resolve in-org) · related_entity(text) · status(text)

## Note
body(text, required) · person/related ref(text) · created_at(date)

Normalization: phone→IL last-9; email→lowercase; currency→₪/commas stripped; date→ISO (ISO or dd/mm/yyyy); city→canonical resolution (reuse the locality resolver from the QA location work); boolean→Hebrew כן/לא accepted. Required fields block the row (reported, not thrown).
