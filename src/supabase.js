import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wpxpldmsmniebokepesi.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweHBsZG1zbW5pZWJva2VwZXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMDk2OTksImV4cCI6MjA4OTU4NTY5OX0.2GFh-_akvfT1L9N9N5YBj2v49X5x48XxAqKXtU6oZr4'

export const supabase = createClient(supabaseUrl, supabaseKey)