const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Replace these coordinates with whatever you wish!
  const myLat = 6.8916; // e.g. Dehiwala Latitude
  const myLng = 80.5955; // e.g. Dehiwala Longitude

  // Find your tenant
  const tenantSlug = 'Acme Corp'; // We see 'Acme Corp' in the database

  const tenants = await prisma.tenants.findMany();
  const tenant = tenants.find(t => t.name.toLowerCase() === tenantSlug.toLowerCase() || t.name === tenantSlug) || tenants[0];

  if (!tenant) {
    console.log(`Tenant ${tenantSlug} not found. Found: ${tenants.map(t => t.name).join(', ')}`);
    return;
  }

  // Update the tenant's location
  await prisma.tenants.update({
    where: { id: tenant.id },
    data: {
      location_lat: myLat,
      location_lng: myLng,
      location_radius_m: 500 // 500 meters allowed radius
    }
  });

  console.log(`✅ Successfully updated ${tenant.name}'s office location to:`);
  console.log(`Latitude: ${myLat}, Longitude: ${myLng}, Radius: 500m`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
