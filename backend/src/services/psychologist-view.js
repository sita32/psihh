// Как психолог выглядит в ответах API: карточка каталога и страница профиля.
// Одна функция на оба случая – поля называются одинаково везде.

const num = (v) => (v === null || v === undefined ? null : Number(v));

function toCard(row) {
  return {
    id: Number(row.id),
    name: `${row.first_name} ${row.last_name}`,
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender,
    age: row.age,
    headline: row.headline,
    avatarUrl: row.avatar_key ? `/${row.avatar_key}` : null,
    experienceYears: row.experience_years,
    rating: num(row.rating_avg),
    reviewsCount: row.reviews_count,
    priceFrom: num(row.price_from),
    methods: row.methods,
    topics: row.topics,
    services: row.services.map((s) => ({ ...s, price: num(s.price) })),
    nextSlot: row.next_slot === undefined ? undefined : row.next_slot,
  };
}

function toProfile(row) {
  return {
    ...toCard(row),
    middleName: row.middle_name,
    bio: row.bio,
    approach: row.approach,
    practiceSince: row.practice_since,
    verifiedAt: row.verified_at,
    education: row.education,
    nextSlot: row.nearest_slot,
  };
}

module.exports = { toCard, toProfile };
