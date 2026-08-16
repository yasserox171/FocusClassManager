import django_filters as filters

from .models import ResourceIssue, Room


class RoomFilter(filters.FilterSet):
    status = filters.CharFilter(field_name="status")
    location = filters.CharFilter(field_name="location", lookup_expr="icontains")
    min_capacity = filters.NumberFilter(field_name="capacity", lookup_expr="gte")
    max_capacity = filters.NumberFilter(field_name="capacity", lookup_expr="lte")
    resource = filters.CharFilter(method="filter_resource", label="Resource type code")
    has_open_issues = filters.BooleanFilter(method="filter_open_issues")

    class Meta:
        model = Room
        fields = ("status", "location", "min_capacity", "max_capacity")

    def filter_resource(self, queryset, name, value):
        codes = [code.strip() for code in value.split(",") if code.strip()]
        for code in codes:
            queryset = queryset.filter(
                resources__resource_type__code=code, resources__quantity__gt=0
            )
        return queryset.distinct()

    def filter_open_issues(self, queryset, name, value):
        lookup = {"issues__status__in": ["open", "in_progress"]}
        if value:
            return queryset.filter(**lookup).distinct()
        return queryset.exclude(**lookup).distinct()


class ResourceIssueFilter(filters.FilterSet):
    class Meta:
        model = ResourceIssue
        fields = ("room", "status", "room_resource")
